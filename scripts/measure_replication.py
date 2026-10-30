"""Measure replication lag: how long after an item is saved at one branch it can be read at the others.

    pip install httpx
    python scripts/measure_replication.py --items 30

Items are reported at A, B and C in turn. For each one the script polls the two other branches every
20 ms and records when the item first appears there. Results are printed and saved as CSV.
"""
import argparse
import csv
import statistics
import time
from pathlib import Path

import httpx

from _common import BRANCHES, NAMES, ROOT, is_up, new_user


def percentile(values, p):
    values = sorted(values)
    k = (len(values) - 1) * p / 100
    f, c = int(k), min(int(k) + 1, len(values) - 1)
    return values[f] + (values[c] - values[f]) * (k - f)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--items", type=int, default=30)
    parser.add_argument("--csv", default=str(ROOT / "docs" / "results" / "replication_lag.csv"))
    args = parser.parse_args()

    branches = [b for b in BRANCHES if is_up(b)]
    if len(branches) < 2:
        raise SystemExit("Start at least two branches first (docker compose up).")
    users = {b: new_user(b, "lag")[1] for b in branches}
    client = httpx.Client(timeout=5)
    rows = []
    print(f"Reporting {args.items} items across {', '.join(NAMES[b] for b in branches)}…")
    for n in range(args.items):
        src = branches[n % len(branches)]
        t0 = time.perf_counter()
        r = client.post(BRANCHES[src] + "/items", headers=users[src], json={
            "type": "LOST", "category": "other", "title": f"Lag probe {n}", "event_date": time.strftime("%Y-%m-%d")})
        r.raise_for_status()
        saved = time.perf_counter()
        item_id = r.json()["id"]
        pending = {b for b in branches if b != src}
        while pending and time.perf_counter() - saved < 30:
            for b in list(pending):
                if client.get(f"{BRANCHES[b]}/items/{item_id}").status_code == 200:
                    rows.append({"item": n, "from": src, "to": b, "lag_ms": round((time.perf_counter() - saved) * 1000, 1),
                                 "write_ms": round((saved - t0) * 1000, 1)})
                    pending.discard(b)
            time.sleep(0.02)
        for b in pending:
            rows.append({"item": n, "from": src, "to": b, "lag_ms": None, "write_ms": round((saved - t0) * 1000, 1)})

    lags = [r["lag_ms"] for r in rows if r["lag_ms"] is not None]
    writes = [r["write_ms"] for r in rows]
    lost = sum(1 for r in rows if r["lag_ms"] is None)
    print(f"\nReplication lag over {len(lags)} copies ({lost} not arrived within 30 s):")
    print(f"  median {statistics.median(lags):7.1f} ms   p95 {percentile(lags, 95):7.1f} ms   "
          f"max {max(lags):7.1f} ms   min {min(lags):6.1f} ms")
    print(f"Time to save a report at its home branch: median {statistics.median(writes):.1f} ms")

    path = Path(args.csv)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["item", "from", "to", "write_ms", "lag_ms"])
        w.writeheader()
        w.writerows(rows)
    print(f"Saved {len(rows)} rows to {path}")


if __name__ == "__main__":
    main()
