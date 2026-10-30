"""Matching LOST items with FOUND items.

Score out of 100 for a (lost, found) pair:
  +40  same category (required; different categories never match)
  +20  same colour   (+10 if one of them didn't give a colour, 0 if the colours differ)
  +10  per shared descriptive word in title/description, at most +20
  +20  found within 3 days after it was lost, +10 within 14 days
        (an item found more than a day BEFORE it was lost cannot be the same item: no match)
Pairs scoring at least MATCH_THRESHOLD (default 60) are saved as possible matches.

How this works in a distributed system without coordination:
  - every branch runs the matching on its OWN copy of the items, whenever an item is created or
    changed here OR arrives from another branch;
  - a match's id is derived from the two item ids (uuid5), so all branches create the SAME match
    and a pair is never saved twice;
  - only an item's home branch changes its status to MATCHED (it is the item's primary).
"""
import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from .models import Item, ItemStatus, ItemType, Match

log = logging.getLogger("matching")

MATCH_NAMESPACE = uuid.UUID("6f1c2a52-3c7e-4b8e-9a52-1a0c0e9d4f11")
ACTIVE = (ItemStatus.OPEN, ItemStatus.MATCHED)

STOPWORDS = {
    "the", "and", "with", "for", "from", "near", "has", "have", "had", "was", "were", "this", "that",
    "inside", "left", "lost", "found", "item", "one", "two", "some", "very", "small", "big", "large",
    "new", "old", "its", "his", "her", "my", "our", "your", "their", "them", "there", "here", "into",
    "onto", "under", "over", "about", "around", "not", "but", "are", "can", "could", "please",
}


def match_id(lost_id: uuid.UUID, found_id: uuid.UUID) -> uuid.UUID:
    return uuid.uuid5(MATCH_NAMESPACE, f"{lost_id}:{found_id}")


def keywords(item: Item) -> set[str]:
    text = f"{item.title} {item.description or ''}".lower()
    return {w for w in re.findall(r"[a-z0-9]+", text) if len(w) >= 3 and w not in STOPWORDS}


def score(lost: Item, found: Item) -> int:
    if lost.category != found.category:
        return 0
    gap = (found.event_date - lost.event_date).days
    if gap < -1:
        return 0
    points = 40
    if lost.colour and found.colour:
        points += 20 if lost.colour == found.colour else 0
    else:
        points += 10
    shared = keywords(lost) & keywords(found)
    points += min(20, 10 * len(shared))
    points += 20 if gap <= 3 else 10 if gap <= 14 else 0
    return min(points, 100)


def find_new_matches(db: Session, item: Item) -> list[Match]:
    """Compare one item with every active item of the opposite type and save new matches
    (not committed). Returns only the matches that did not exist yet on this branch."""
    if item.status not in ACTIVE:
        return []
    other_type = ItemType.FOUND if item.type == ItemType.LOST else ItemType.LOST
    candidates = db.scalars(
        select(Item).where(Item.type == other_type, Item.category == item.category, Item.status.in_(ACTIVE))
    ).all()
    new: list[Match] = []
    for other in candidates:
        if item.reported_by and item.reported_by == other.reported_by:
            continue  # the same person reported both: not a useful match
        lost, found = (item, other) if item.type == ItemType.LOST else (other, item)
        points = score(lost, found)
        if points < settings.match_threshold:
            continue
        mid = match_id(lost.id, found.id)
        if db.get(Match, mid) is not None:
            continue
        m = Match(id=mid, lost_item_id=lost.id, found_item_id=found.id, score=points)
        db.add(m)
        new.append(m)
    return new


def run_for_item(item_id: uuid.UUID, _retry: bool = True) -> int:
    """Called after an item is saved here or received from another branch.
    Saves new matches, marks THIS branch's own items as MATCHED, and notifies the people involved."""
    from .announce import announce_match  # local imports avoid a circular import
    from .replication import item_payload, record_event

    with SessionLocal() as db:
        item = db.get(Item, item_id)
        if item is None:
            return 0
        new = find_new_matches(db, item)
        if not new:
            return 0
        for m in new:
            for iid in (m.lost_item_id, m.found_item_id):
                it = db.get(Item, iid)
                if it and it.home_branch == settings.branch_id and it.status == ItemStatus.OPEN:
                    it.status = ItemStatus.MATCHED
                    it.version += 1
                    db.flush()
                    record_event(db, "item.updated", item_payload(it))
        try:
            db.commit()
        except IntegrityError:
            # Another thread on this branch saved the same match at the same moment: try again
            db.rollback()
            return run_for_item(item_id, _retry=False) if _retry else 0
        for m in new:
            log.info("new match %s (score %s)", m.id, m.score)
            announce_match(db, m)
        return len(new)


def safe_run_for_item(item_id: uuid.UUID) -> None:
    """Matching must never break saving an item: log problems instead of raising."""
    try:
        run_for_item(item_id)
    except Exception:
        log.exception("matching failed for item %s", item_id)
