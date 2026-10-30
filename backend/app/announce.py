"""Turns matches and claims into short notification messages for the people involved."""
from sqlalchemy.orm import Session

from .config import KNOWN_BRANCHES
from .models import Claim, ClaimStatus, Item, Match, User
from .notifier import notifier

BRANCH_NAMES = {b["id"]: b["name"] for b in KNOWN_BRANCHES}


def _where(item: Item) -> str:
    return BRANCH_NAMES.get(item.home_branch, f"branch {item.home_branch}")


def announce_match(db: Session, m: Match) -> None:
    lost, found = db.get(Item, m.lost_item_id), db.get(Item, m.found_item_id)
    if not lost or not found:
        return
    if lost.reported_by:
        notifier.to_users([lost.reported_by], {
            "type": "match",
            "title": "Possible match for your lost item",
            "message": f"“{found.title}” was found ({_where(found)}). It may be your “{lost.title}”.",
            "link": f"/items/{found.id}",
            "score": m.score,
        })
    if found.reported_by:
        notifier.to_users([found.reported_by], {
            "type": "match",
            "title": "Someone may be looking for the item you found",
            "message": f"“{lost.title}” was reported lost ({_where(lost)}). It may match your “{found.title}”.",
            "link": f"/items/{lost.id}",
            "score": m.score,
        })


def announce_claim(db: Session, claim: Claim, event_type: str) -> None:
    item = db.get(Item, claim.item_id)
    if not item:
        return
    link = f"/items/{item.id}"
    if event_type == "claim.created":
        claimant = db.get(User, claim.claimant_id)
        who = claimant.full_name if claimant else "Someone"
        msg = {"type": "claim", "title": "New claim to verify",
               "message": f"{who} claims “{item.title}”.", "link": "/staff"}
        notifier.to_staff(claim.home_branch, msg)
        if item.reported_by:
            notifier.to_users([item.reported_by], {
                "type": "claim", "title": "Someone claimed the item you found",
                "message": f"Staff at {_where(item)} will check that “{item.title}” is really theirs.",
                "link": link,
            })
        return

    # claim.updated: tell the claimant what happened
    texts = {
        ClaimStatus.APPROVED: ("Your claim was approved", f"Collect “{item.title}” at the {_where(item)} branch office."),
        ClaimStatus.REJECTED: ("Your claim was not accepted", f"Staff could not confirm that “{item.title}” is yours."),
    }
    if claim.handed_over_at:
        title, text = "Item handed over", f"“{item.title}” is back with its owner. Case closed."
    elif claim.status in texts:
        title, text = texts[claim.status]
    else:
        return
    notifier.to_users([claim.claimant_id], {"type": "claim", "title": title, "message": text, "link": link})
