"""Check that every branch holds the same data (eventual consistency).

    pip install httpx PyJWT
    python scripts/check_consistency.py            # check once
    python scripts/check_consistency.py --wait 60  # keep checking until consistent (max 60 s)

It downloads each online branch's full snapshot (users, items, claims) and compares them record by
record: every record must exist on every branch with the same version. Exit code 0 = consistent.
"""
import argparse
import sys
import time

import httpx

from _common import BRANCHES, NAMES, internal_token, is_up


def snapshots(branches) -> dict:
    headers = {"Authorization": f"Bearer {internal_token()}"}
    return {b: httpx.get(BRANCHES[b] + "/replication/snapshot", headers=headers, timeout=20).json() for b in branches}


def compare(snaps: dict) -> list[str]:
    """Return a list of differences (empty = consistent)."""
    problems = []
    for kind, key in (("items", "version"), ("claims", "version"), ("users", None)):
        tables = {b: {r["id"]: (r.get(key) if key else r["email"]) for r in s[kind]} for b, s in snaps.items()}
        all_ids = set().union(*[set(t) for t in tables.values()])
        for rid in sorted(all_ids):
            values = {b: t.get(rid, "missing") for b, t in tables.items()}
            if len(set(map(str, values.values()))) > 1:
                where = ", ".join(f"{NAMES[b]}={v}" for b, v in values.items())
                problems.append(f"{kind[:-1]} {rid[:8]}…: {where}")
    return problems


def check(quiet: bool = False) -> tuple[bool, dict, list[str]]:
    online = [b for b in BRANCHES if is_up(b)]
    if len(online) < 2:
        return False, {}, [f"only {len(online)} branch(es) online: {online}"]
    snaps = snapshots(online)
    problems = compare(snaps)
    counts = {b: {k: len(snaps[b][k]) for k in ("users", "items", "claims")} for b in online}
    return not problems, counts, problems


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wait", type=float, nargs="?", const=60, default=0, help="keep checking for up to this many seconds")
    args = parser.parse_args()

    start = time.perf_counter()
    while True:
        ok, counts, problems = check()
        if ok or time.perf_counter() - start >= args.wait:
            break
        time.sleep(0.5)
    elapsed = time.perf_counter() - start

    for b, c in counts.items():
        print(f"  {NAMES[b]:9} users={c['users']:4}  items={c['items']:5}  claims={c['claims']:4}")
    if ok:
        print(f"CONSISTENT: all online branches hold identical data (checked in {elapsed:.1f} s)")
        sys.exit(0)
    print(f"NOT CONSISTENT after {elapsed:.1f} s: {len(problems)} difference(s)")
    for p in problems[:20]:
        print("   -", p)
    sys.exit(1)


if __name__ == "__main__":
    main()
