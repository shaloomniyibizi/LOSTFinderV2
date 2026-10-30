"""Claims: "this found item is mine".

Safety rule: a claim is ALWAYS decided at the item's home branch (its primary, like the GFS primary
that orders writes). If you are using another branch, your request is forwarded there.

At the home branch the item's database row is LOCKED (SELECT ... FOR UPDATE) while the claim is
checked and saved, so when two people claim the same item at the same moment, the second one waits,
then sees the item is already CLAIMED and is refused. Exactly one claim can succeed.

Life of a claim:   PENDING --approve--> APPROVED --handover--> (item RETURNED)
                          \\--reject---> REJECTED   (the item can be claimed again)
"""
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..announce import BRANCH_NAMES, announce_claim
from ..config import settings
from ..database import get_db
from ..models import Claim, ClaimStatus, Item, ItemStatus, ItemType, Match, QueuedRequest, Role, User
from ..replication import claim_payload, item_payload, record_event
from ..reliability import monitor, queue_claim
from ..schemas import ClaimDecision, ClaimIn, ClaimOut, QueuedOut
from ..security import get_current_user

router = APIRouter(tags=["claims"])

FORWARD_HEADER = "X-Forwarded-From-Branch"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class HomeUnreachable(Exception):
    pass


def _forward(request: Request, home: str, path: str, body: dict | None, queue_if_down: bool = False) -> JSONResponse:
    """Send the same request to the home branch and return its answer unchanged.
    If the home branch is down: raise HomeUnreachable (claims are then queued) or answer 503."""
    if request.headers.get(FORWARD_HEADER):
        raise HTTPException(409, "Request was forwarded to the wrong branch")
    url = settings.peer_urls.get(home)
    if not url:
        raise HTTPException(503, f"Don't know how to reach branch {home}")
    down_message = (f"The {BRANCH_NAMES.get(home, home)} branch, which handles this item, is offline right now. "
                    "Please try again in a few minutes.")
    if monitor.is_down(home):  # the heartbeat monitor already knows: don't wait for a timeout
        if queue_if_down:
            raise HomeUnreachable("marked down by heartbeat monitor")
        raise HTTPException(503, down_message)
    try:
        r = httpx.post(
            url + path,
            json=body,
            headers={"Authorization": request.headers.get("Authorization", ""), FORWARD_HEADER: settings.branch_id},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        if queue_if_down:
            raise HomeUnreachable(exc.__class__.__name__)
        raise HTTPException(503, down_message)
    try:
        content = r.json()
    except ValueError:
        content = {"detail": f"Branch {home} answered HTTP {r.status_code}"}
    return JSONResponse(status_code=r.status_code, content=content)


def _to_out(db: Session, claim: Claim, staff_view: bool = False) -> ClaimOut:
    out = ClaimOut.model_validate(claim)
    item = db.get(Item, claim.item_id)
    claimant = db.get(User, claim.claimant_id)
    out.item_title = item.title if item else None
    out.item_question = item.verification_question if item else None
    out.claimant_name = claimant.full_name if claimant else None
    if staff_view and claimant:
        out.claimant_email, out.claimant_phone = claimant.email, claimant.phone
    return out


def _locked(db: Session, model, row_id: uuid.UUID):
    """SELECT ... FOR UPDATE: wait until no other transaction holds this row, then lock it.
    populate_existing=True is essential: the row may already be in this session's memory
    (read a moment earlier, BEFORE the lock); without it we would get that stale copy instead of
    the row as it is now, and two simultaneous claims could both see the item as still free."""
    stmt = select(model).where(model.id == row_id).with_for_update().execution_options(populate_existing=True)
    return db.scalars(stmt).one()


def _is_staff_for(user: User, branch_id: str) -> bool:
    return user.role == Role.admin or (user.role == Role.staff and user.branch_id == branch_id)


# ---------------------------------------------------------------- make a claim
@router.post("/items/{item_id}/claims", response_model=ClaimOut, status_code=201)
def create_claim(
    item_id: uuid.UUID,
    data: ClaimIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Claim a FOUND item as yours. Only one claim per item can be active at a time."""
    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "Item not found")
    if item.home_branch != settings.branch_id:
        try:
            return _forward(request, item.home_branch, f"/items/{item_id}/claims", data.model_dump(), queue_if_down=True)
        except HomeUnreachable as exc:
            # Phase 5: don't refuse; keep the claim here and deliver it when the home branch is back
            q = queue_claim(db, item.id, user.id, item.home_branch, data.model_dump(), str(exc))
            where = BRANCH_NAMES.get(item.home_branch, item.home_branch)
            return JSONResponse(status_code=202, content={
                "queued": True, "id": str(q.id), "target_branch": item.home_branch, "status": q.status,
                "message": f"The {where} branch is offline. Your claim is saved at {BRANCH_NAMES.get(settings.branch_id)} "
                           f"and will be sent to {where} automatically as soon as it is back.",
            })

    # --- at the home branch: lock the item row until this transaction ends ---
    item = _locked(db, Item, item_id)
    if item.type != ItemType.FOUND:
        raise HTTPException(422, "Only FOUND items can be claimed")
    if item.reported_by == user.id:
        raise HTTPException(403, "You reported this item yourself")
    if item.status == ItemStatus.CLAIMED:
        raise HTTPException(409, "Someone has already claimed this item. Staff are checking that claim.")
    if item.status == ItemStatus.RETURNED:
        raise HTTPException(409, "This item has already been returned to its owner")

    claim = Claim(
        item_id=item.id, claimant_id=user.id, answer=data.answer.strip(),
        status=ClaimStatus.PENDING, home_branch=settings.branch_id, version=1,
    )
    db.add(claim)
    item.status = ItemStatus.CLAIMED
    item.version += 1
    db.flush()
    record_event(db, "item.updated", item_payload(item))
    record_event(db, "claim.created", claim_payload(claim))
    db.commit()  # releases the lock
    announce_claim(db, claim, "claim.created")
    return _to_out(db, claim)


# ---------------------------------------------------------------- staff decisions
def _decide(claim_id: uuid.UUID, action: str, note: str | None, request: Request, db: Session, user: User):
    claim = db.get(Claim, claim_id)
    if claim is None:
        raise HTTPException(404, "Claim not found")
    if claim.home_branch != settings.branch_id:
        return _forward(request, claim.home_branch, f"/claims/{claim_id}/{action}", {"note": note})
    if not _is_staff_for(user, claim.home_branch):
        raise HTTPException(403, "Only staff of this branch can decide on claims")

    claim = _locked(db, Claim, claim_id)
    item = _locked(db, Item, claim.item_id)

    if action in ("approve", "reject") and claim.status != ClaimStatus.PENDING:
        raise HTTPException(409, f"This claim was already {claim.status.value.lower()}")
    if action == "approve":
        claim.status = ClaimStatus.APPROVED
        claim.decided_at = _now()
    elif action == "reject":
        claim.status = ClaimStatus.REJECTED
        claim.decided_at = _now()
        has_match = db.scalar(select(Match.id).where(Match.found_item_id == item.id).limit(1)) is not None
        item.status = ItemStatus.MATCHED if has_match else ItemStatus.OPEN  # can be claimed again
        item.version += 1
    elif action == "handover":
        if claim.status != ClaimStatus.APPROVED or claim.handed_over_at:
            raise HTTPException(409, "Only an approved claim can be handed over, once")
        claim.handed_over_at = _now()
        item.status = ItemStatus.RETURNED
        item.version += 1
    claim.handled_by = user.id
    if note:
        claim.staff_note = note.strip()
    claim.version += 1
    db.flush()
    if action != "approve":
        record_event(db, "item.updated", item_payload(item))
    record_event(db, "claim.updated", claim_payload(claim))
    db.commit()
    announce_claim(db, claim, "claim.updated")
    return _to_out(db, claim, staff_view=True)


@router.post("/claims/{claim_id}/approve", response_model=ClaimOut)
def approve_claim(claim_id: uuid.UUID, request: Request, data: ClaimDecision | None = None,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Staff checked the answer and are convinced: the owner may collect the item."""
    return _decide(claim_id, "approve", data.note if data else None, request, db, user)


@router.post("/claims/{claim_id}/reject", response_model=ClaimOut)
def reject_claim(claim_id: uuid.UUID, request: Request, data: ClaimDecision | None = None,
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Staff are not convinced. The item becomes claimable again."""
    return _decide(claim_id, "reject", data.note if data else None, request, db, user)


@router.post("/claims/{claim_id}/handover", response_model=ClaimOut)
def handover(claim_id: uuid.UUID, request: Request, data: ClaimDecision | None = None,
             db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The owner collected the item: the case is closed (item RETURNED)."""
    return _decide(claim_id, "handover", data.note if data else None, request, db, user)


# ---------------------------------------------------------------- lists
@router.get("/claims/mine", response_model=list[ClaimOut])
def my_claims(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    claims = db.scalars(select(Claim).where(Claim.claimant_id == user.id).order_by(Claim.created_at.desc())).all()
    return [_to_out(db, c) for c in claims]


@router.get("/claims/queued/mine", response_model=list[QueuedOut])
def my_queued_claims(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Claims you made at THIS branch that are waiting for (or were sent to) an offline home branch."""
    rows = db.scalars(select(QueuedRequest).where(QueuedRequest.user_id == user.id)
                      .order_by(QueuedRequest.created_at.desc())).all()
    out = []
    for q in rows:
        item = db.get(Item, q.item_id)
        out.append(QueuedOut(id=q.id, item_id=q.item_id, item_title=item.title if item else None,
                             target_branch=q.target_branch, status=q.status, attempts=q.attempts,
                             last_error=q.last_error, created_at=q.created_at, delivered_at=q.delivered_at))
    return out


@router.get("/claims", response_model=list[ClaimOut])
def list_claims(
    status: ClaimStatus | None = None,
    branch: str | None = Query(None, description="Admins only: filter by home branch"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Staff: claims on their branch's items. Admin: all claims."""
    if user.role == Role.staff:
        stmt = select(Claim).where(Claim.home_branch == user.branch_id)
    elif user.role == Role.admin:
        stmt = select(Claim)
        if branch:
            stmt = stmt.where(Claim.home_branch == branch.upper())
    else:
        raise HTTPException(403, "Only staff and admins can list claims")
    if status:
        stmt = stmt.where(Claim.status == status)
    claims = db.scalars(stmt.order_by(Claim.created_at.desc())).all()
    return [_to_out(db, c, staff_view=True) for c in claims]


@router.get("/items/{item_id}/claims", response_model=list[ClaimOut])
def item_claims(item_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Claims on one item: visible to staff of its home branch, admins, and the person who found it."""
    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "Item not found")
    staff = _is_staff_for(user, item.home_branch)
    if not (staff or item.reported_by == user.id):
        raise HTTPException(403, "Not allowed")
    claims = db.scalars(select(Claim).where(Claim.item_id == item_id).order_by(Claim.created_at.desc())).all()
    return [_to_out(db, c, staff_view=staff) for c in claims]
