"""The notification bell: a WebSocket for live messages, and an activity feed for everything so far.

The activity feed is built from replicated data (matches and claims), so it is the same whichever
branch you ask. Live messages are pushed by the branch you are connected to (see notifier.py).
"""
import asyncio
import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..announce import BRANCH_NAMES
from ..config import settings
from ..database import SessionLocal, get_db
from ..models import Claim, ClaimStatus, Item, Match, User
from ..notifier import Connection, notifier
from ..schemas import ActivityOut
from ..security import get_current_user, user_from_token

router = APIRouter(tags=["notifications"])


@router.websocket("/ws")
async def websocket(ws: WebSocket, token: str = ""):
    """Connect with ws://<branch>/ws?token=<login token>. Messages are JSON:
    {"type": "match" | "claim", "title": ..., "message": ..., "link": ...}"""
    def lookup():
        with SessionLocal() as db:
            return user_from_token(db, token)

    user = await asyncio.to_thread(lookup)
    if user is None:
        await ws.close(code=4401)
        return
    await ws.accept()
    conn = Connection(ws, user.id, user.role.value, user.branch_id)
    notifier.add(conn)
    await ws.send_text(json.dumps({"type": "hello", "branch": settings.branch_id}))
    try:
        while True:
            await ws.receive_text()  # the browser may send "ping" to keep the connection open
    except WebSocketDisconnect:
        pass
    finally:
        notifier.remove(conn)


@router.get("/me/activity", response_model=list[ActivityOut])
def my_activity(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Recent matches and claims that concern you, newest first."""
    out: list[ActivityOut] = []
    my_items = {i.id: i for i in db.scalars(select(Item).where(Item.reported_by == user.id)).all()}

    if my_items:
        ids = list(my_items)
        for m in db.scalars(select(Match).where(or_(Match.lost_item_id.in_(ids), Match.found_item_id.in_(ids)))):
            mine_id, other_id = (m.lost_item_id, m.found_item_id) if m.lost_item_id in my_items else (m.found_item_id, m.lost_item_id)
            mine, other = my_items[mine_id], db.get(Item, other_id)
            if other is None:
                continue
            where = BRANCH_NAMES.get(other.home_branch, other.home_branch)
            verb = "found" if other.type.value == "FOUND" else "reported lost"
            out.append(ActivityOut(
                kind="match", title=f"Possible match ({m.score}%)",
                message=f"“{other.title}” was {verb} ({where}). It may match your “{mine.title}”.",
                link=f"/items/{other.id}", at=m.created_at,
            ))
        for c in db.scalars(select(Claim).where(Claim.item_id.in_(ids))):
            claimant = db.get(User, c.claimant_id)
            out.append(ActivityOut(
                kind="claim_on_my_item", title="Claim on an item you found",
                message=f"{claimant.full_name if claimant else 'Someone'} claimed “{my_items[c.item_id].title}”: "
                        f"{c.status.value.lower()}{', handed over' if c.handed_over_at else ''}.",
                link=f"/items/{c.item_id}", at=c.decided_at or c.created_at,
            ))

    for c in db.scalars(select(Claim).where(Claim.claimant_id == user.id)):
        item = db.get(Item, c.item_id)
        title = item.title if item else "an item"
        where = BRANCH_NAMES.get(c.home_branch, c.home_branch)
        if c.handed_over_at:
            t, msg = "Item handed over", f"You collected “{title}”. Case closed."
        elif c.status == ClaimStatus.APPROVED:
            t, msg = "Claim approved", f"Collect “{title}” at the {where} branch office."
        elif c.status == ClaimStatus.REJECTED:
            t, msg = "Claim not accepted", f"Staff could not confirm that “{title}” is yours."
        else:
            t, msg = "Claim submitted", f"Staff at {where} are checking your claim for “{title}”."
        out.append(ActivityOut(kind="claim", title=t, message=msg, link=f"/items/{c.item_id}",
                               at=c.handed_over_at or c.decided_at or c.created_at))

    out.sort(key=lambda a: a.at, reverse=True)
    return out[:30]
