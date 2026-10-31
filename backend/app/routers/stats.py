"""Numbers for the dashboards (Phase 6: user interface).

Every branch holds a full copy of all items, claims, matches and users, so ANY branch can
answer these questions for the whole network. No branch needs to ask the others.
"""
from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import matching
from ..config import settings
from ..database import get_db
from ..models import Claim, ClaimStatus, Item, ItemStatus, ItemType, Match, User
from ..schemas import ItemOut
from ..security import get_current_user

router = APIRouter(tags=["stats"])


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _claim_stage(c: Claim) -> str:
    if c.handed_over_at:
        return "COLLECTED"
    return c.status.value


@router.get("/stats/overview")
def overview(db: Session = Depends(get_db), days: int = Query(14, ge=7, le=90)):
    """Network-wide figures: reports per day, by category, status and branch; claims; return rate."""
    now = datetime.now(timezone.utc)
    today = now.date()
    start = today - timedelta(days=days - 1)

    items = db.execute(select(Item.type, Item.status, Item.category, Item.home_branch, Item.created_at)).all()
    claims = db.scalars(select(Claim)).all()

    per_day = {start + timedelta(days=i): {"LOST": 0, "FOUND": 0} for i in range(days)}
    last7 = prev7 = 0
    for t, _s, _c, _b, created in items:
        d = _aware(created).date()
        if d in per_day:
            per_day[d][t.value] += 1
        age = (today - d).days
        if 0 <= age < 7:
            last7 += 1
        elif 7 <= age < 14:
            prev7 += 1

    by_category = Counter(c for _t, _s, c, _b, _ in items)
    by_branch: dict[str, dict[str, int]] = {}
    for t, _s, _c, b, _ in items:
        by_branch.setdefault(b, {"LOST": 0, "FOUND": 0})[t.value] += 1
    status_lost = Counter(s.value for t, s, *_ in items if t == ItemType.LOST)
    status_found = Counter(s.value for t, s, *_ in items if t == ItemType.FOUND)

    claim_stages = Counter(_claim_stage(c) for c in claims)
    handed = [c for c in claims if c.handed_over_at]
    returned_30 = sum(1 for c in handed if (now - _aware(c.handed_over_at)).days < 30)
    durations = [(_aware(c.handed_over_at) - _aware(c.created_at)).total_seconds() / 3600 for c in handed]

    lost_total = sum(status_lost.values())
    found_total = sum(status_found.values())
    active = [s for s in (ItemStatus.OPEN, ItemStatus.MATCHED)]
    pending_matches = db.scalar(
        select(func.count()).select_from(Match)
        .join(Item, Item.id == Match.lost_item_id).where(Item.status.in_(active))
    ) or 0

    return {
        "branch": settings.branch_id,
        "generated_at": now,
        "days": [{"date": d.isoformat(), "lost": v["LOST"], "found": v["FOUND"]} for d, v in per_day.items()],
        "last_7_days": last7,
        "previous_7_days": prev7,
        "by_category": [{"category": k, "count": v} for k, v in by_category.most_common()],
        "by_branch": [{"branch": b, "lost": v["LOST"], "found": v["FOUND"]} for b, v in sorted(by_branch.items())],
        "lost_by_status": {s.value: status_lost.get(s.value, 0) for s in ItemStatus},
        "found_by_status": {s.value: status_found.get(s.value, 0) for s in ItemStatus},
        "claims_by_stage": {k: claim_stages.get(k, 0) for k in ("PENDING", "APPROVED", "COLLECTED", "REJECTED")},
        "totals": {
            "items": len(items),
            "lost": lost_total,
            "found": found_total,
            "open_lost": status_lost.get("OPEN", 0) + status_lost.get("MATCHED", 0),
            "found_in_custody": sum(v for k, v in status_found.items() if k != "RETURNED"),
            "returned": len(handed),
            "returned_30_days": returned_30,
            "pending_claims": claim_stages.get("PENDING", 0),
            "awaiting_handover": claim_stages.get("APPROVED", 0),
            "pending_matches": pending_matches,
            "users": db.scalar(select(func.count()).select_from(User)) or 0,
            # share of handed-in items that went back to their owner
            "return_rate": round(100 * status_found.get("RETURNED", 0) / found_total) if found_total else 0,
            "avg_hours_to_handover": round(sum(durations) / len(durations), 1) if durations else None,
        },
    }


@router.get("/me/overview")
def my_overview(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The logged-in user's own figures."""
    mine = db.scalars(select(Item).where(Item.reported_by == user.id)).all()
    lost = [i for i in mine if i.type == ItemType.LOST]
    found = [i for i in mine if i.type == ItemType.FOUND]
    my_claims = db.scalars(select(Claim).where(Claim.claimant_id == user.id)).all()
    ids = [i.id for i in mine if i.status in (ItemStatus.OPEN, ItemStatus.MATCHED)]  # still being searched for
    matches = db.scalar(select(func.count()).select_from(Match).where(
        or_(Match.lost_item_id.in_(ids), Match.found_item_id.in_(ids)))) if ids else 0
    on_my_items = db.scalar(select(func.count()).select_from(Claim).where(
        Claim.item_id.in_([i.id for i in found]), Claim.status == ClaimStatus.PENDING)) if found else 0
    return {
        "open_lost": sum(1 for i in lost if i.status in (ItemStatus.OPEN, ItemStatus.MATCHED)),
        "matches": matches or 0,
        "active_claims": sum(1 for c in my_claims if c.status != ClaimStatus.REJECTED and not c.handed_over_at),
        "ready_to_collect": sum(1 for c in my_claims if c.status == ClaimStatus.APPROVED and not c.handed_over_at),
        "collected": sum(1 for c in my_claims if c.handed_over_at),
        "found_waiting": sum(1 for i in found if i.status != ItemStatus.RETURNED),
        "returned_to_me": sum(1 for i in lost if i.status == ItemStatus.RETURNED),
        "claims_on_my_items": on_my_items or 0,
        "lost_by_status": {s.value: sum(1 for i in lost if i.status == s) for s in ItemStatus},
        "reports": len(mine),
    }


@router.get("/me/matches")
def my_matches(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Possible matches for every item the user reported, with the reasons behind each score."""
    mine = {i.id: i for i in db.scalars(select(Item).where(Item.reported_by == user.id)).all()}
    if not mine:
        return []
    rows = db.scalars(select(Match).where(
        or_(Match.lost_item_id.in_(mine), Match.found_item_id.in_(mine))).order_by(Match.score.desc())).all()
    out = []
    for m in rows:
        lost, found = db.get(Item, m.lost_item_id), db.get(Item, m.found_item_id)
        if lost is None or found is None:
            continue
        out.append({
            "id": m.id,
            "score": m.score,
            "created_at": m.created_at,
            "side": "LOST" if lost.id in mine else "FOUND",  # which of the two is the user's item
            "lost": ItemOut.model_validate(lost),
            "found": ItemOut.model_validate(found),
            "reasons": [{"label": r, "points": p} for r, p in matching.explain(lost, found)],
        })
    return out
