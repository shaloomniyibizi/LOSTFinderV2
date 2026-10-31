"""Fill the system with realistic demo data, with a picture for every item.

Start the whole system first (docker compose up), then in the project folder:
    pip install -r scripts/requirements.txt
    python scripts/seed_demo.py

What it creates (from scripts/demo_data.json and scripts/demo_photos/):
  - 8 member accounts (password demo1234), e.g. aline@demo.rw, eric@demo.rw, daniel@demo.rw
  - 3 staff accounts, one per branch: grace@staff.rw (Campus), olivier@staff.rw (Bus Park), ange@staff.rw (Airport)
  - 38 lost and found reports spread over the three branches, each with a picture
  - matching pairs, so "My matches" is filled in
  - 10 claims in every state: waiting for review, approved, handed over and rejected
  - report dates spread over the last 18 days, so the dashboard charts show a trend

The staff accounts are created with the admin login from your .env (ADMIN_EMAIL / ADMIN_PASSWORD).
Running it a second time does nothing unless you add --force.

Options:
    --force          add the demo items again even if they are already there
    --no-dates       don't spread the report dates (skips the docker step)
    --no-photos      don't upload pictures
"""
import argparse
import json
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import httpx

from _common import BRANCHES, NAMES, ROOT, load_env

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / "demo_data.json").read_text(encoding="utf-8"))
PHOTOS = HERE / "demo_photos"
client = httpx.Client(timeout=30)


def fail(msg: str):
    print(f"\n{msg}")
    sys.exit(1)


class Logins:
    """Caches one token per (email, branch). Waits for accounts that are still being copied to a branch."""

    def __init__(self):
        self.tokens: dict[tuple[str, str], dict] = {}

    def headers(self, email: str, password: str, branch: str) -> dict:
        key = (email, branch)
        if key not in self.tokens:
            for _ in range(40):
                r = client.post(BRANCHES[branch] + "/auth/login", data={"username": email, "password": password})
                if r.status_code == 200:
                    self.tokens[key] = {"Authorization": "Bearer " + r.json()["access_token"]}
                    break
                time.sleep(0.5)
            else:
                fail(f"Could not log in as {email} at {NAMES[branch]} (HTTP {r.status_code}). Is RabbitMQ running?")
        return self.tokens[key]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-dates", action="store_true")
    ap.add_argument("--no-photos", action="store_true")
    args = ap.parse_args()

    for bid, url in BRANCHES.items():
        try:
            client.get(url + "/health", timeout=3).raise_for_status()
        except httpx.HTTPError:
            fail(f"{NAMES[bid]} (branch {bid}) at {url} is not reachable. Start the system first: docker compose up")

    env = load_env()
    pw = DATA["password"]
    logins = Logins()
    marker = DATA["items"][-1]["title"]
    if not args.force and client.get(BRANCHES["A"] + "/items", params={"q": marker}).json()["total"] > 0:
        print("The demo data is already there. Log in as aline@demo.rw / demo1234.")
        print("(To add it again anyway: python scripts/seed_demo.py --force)")
        return

    # ---- accounts
    print("Accounts")
    for u in DATA["users"]:
        r = client.post(BRANCHES["A"] + "/auth/register",
                        json={"full_name": u["name"], "email": u["email"], "phone": u["phone"], "password": pw})
        if r.status_code not in (201, 409):
            fail(f"Could not create {u['email']}: HTTP {r.status_code} {r.text}")
        print(f"  {'created' if r.status_code == 201 else 'exists '}  {u['email']}")
    admin_email, admin_pw = env.get("ADMIN_EMAIL", "admin@lostfound.local"), env.get("ADMIN_PASSWORD", "")
    admin = logins.headers(admin_email, admin_pw, "A") if admin_pw else None
    if admin is None:
        fail("ADMIN_PASSWORD is missing from .env: it is needed to create the staff accounts.")
    for s in DATA["staff"]:
        r = client.post(BRANCHES["A"] + "/users", headers=admin, json={
            "full_name": s["name"], "email": s["email"], "password": pw, "role": "staff", "branch_id": s["branch"]})
        if r.status_code not in (201, 409):
            fail(f"Could not create staff {s['email']}: HTTP {r.status_code} {r.text}")
        print(f"  {'created' if r.status_code == 201 else 'exists '}  {s['email']} (staff, {NAMES[s['branch']]})")
    emails = {u["key"]: u["email"] for u in DATA["users"] + DATA["staff"]}

    # ---- reports with pictures
    print(f"\nReports ({len(DATA['items'])})")
    ids: dict[str, str] = {}
    for it in DATA["items"]:
        h = logins.headers(emails[it["user"]], pw, it["branch"])
        body = {k: it[k] for k in ("type", "category", "colour", "title", "description", "location")}
        body["event_date"] = (date.today() - timedelta(days=it["days"])).isoformat()
        if it.get("question"):
            body["verification_question"] = it["question"]
        r = client.post(BRANCHES[it["branch"]] + "/items", headers=h, json=body)
        if r.status_code != 201:
            fail(f"Could not save \"{it['title']}\": HTTP {r.status_code} {r.text}")
        ids[it["key"]] = r.json()["id"]
        photo = PHOTOS / f"{it['key']}.jpg"
        note = ""
        if not args.no_photos and photo.exists():
            with photo.open("rb") as f:
                p = client.post(f"{BRANCHES[it['branch']]}/items/{ids[it['key']]}/photo", headers=h,
                                files={"file": (photo.name, f, "image/jpeg")})
            note = " + picture" if p.status_code == 200 else f" (picture failed: HTTP {p.status_code})"
        print(f"  {NAMES[it['branch']]:9} {it['type']:5} {it['title']}{note}")

    # wait until every branch has a copy (claims are checked against the item's copy)
    print("\nWaiting for every branch to receive a copy…", end="", flush=True)
    for _ in range(60):
        counts = [client.get(u + "/items", params={"limit": 1}).json()["total"] for u in BRANCHES.values()]
        if len(set(counts)) == 1:
            break
        time.sleep(0.5)
    print(" done")

    # ---- claims and staff decisions
    print(f"\nClaims ({len(DATA['claims'])})")
    by_key = {it["key"]: it for it in DATA["items"]}
    for c in DATA["claims"]:
        it = by_key[c["item"]]
        home = it["branch"]
        h = logins.headers(emails[c["by"]], pw, home)
        r = client.post(f"{BRANCHES[home]}/items/{ids[c['item']]}/claims", headers=h, json={"answer": c["answer"]})
        if r.status_code not in (201, 202):
            print(f"  could not claim {it['title']}: HTTP {r.status_code} {r.text}")
            continue
        claim_id = r.json()["id"]
        note = {"note": c.get("note")}
        steps = {"approved": ["approve"], "handed_over": ["approve", "handover"], "rejected": ["reject"]}.get(c["outcome"], [])
        for step in steps:
            client.post(f"{BRANCHES[home]}/claims/{claim_id}/{step}", headers=admin, json=note).raise_for_status()
        # the owner's own lost report is closed too once they have their item back
        lost_key = c["item"].replace("-found", "-lost")
        if c["outcome"] == "handed_over" and lost_key in ids:
            lh = by_key[lost_key]["branch"]
            client.patch(f"{BRANCHES[lh]}/items/{ids[lost_key]}", headers=logins.headers(admin_email, admin_pw, lh),
                         json={"status": "RETURNED"})
        print(f"  {c['outcome']:11} {it['title']} (claimed by {emails[c['by']]})")

    if not args.no_dates:
        spread_dates(env, ids)

    print("\nDone. Open http://localhost:3000 and sign in, for example:")
    print("  member:  aline@demo.rw / demo1234   (matches, a claim waiting for review)")
    print("  staff:   ange@staff.rw / demo1234   (Airport review queue)")
    print(f"  admin:   {admin_email} / (your ADMIN_PASSWORD)")


def spread_dates(env: dict, ids: dict[str, str]):
    """Set each report's creation time to its event date, in all three databases, so the
    '14 days' chart shows a trend instead of everything today. Uses the same deterministic
    values in every database, so the copies stay identical."""
    print("\nSpreading report dates over the last days…")
    id_list = ",".join(f"'{i}'" for i in ids.values())
    sql = (
        f"UPDATE items SET created_at = event_date::timestamp + interval '8 hours' "
        f"+ (abs(hashtext(id::text)) % 600) * interval '1 minute' WHERE id IN ({id_list}) "
        f"AND event_date < current_date; "
        f"UPDATE claims SET created_at = created_at - interval '2 days 3 hours', "
        f"decided_at = decided_at - interval '1 day 2 hours', handed_over_at = handed_over_at - interval '20 hours' "
        f"WHERE item_id IN ({id_list}) AND created_at > now() - interval '1 hour';"
    )
    user = env.get("POSTGRES_USER", "postgres")
    for b in "abc":
        cmd = ["docker", "compose", "exec", "-T", f"db-{b}", "psql", "-q", "-U", user, "-d", f"branch_{b}", "-c", sql]
        res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"  skipped ({(res.stderr or res.stdout).strip()[:120]})")
            print("  The data is fine; the charts will just show every report on today's date.")
            return
    print("  done")


if __name__ == "__main__":
    main()
