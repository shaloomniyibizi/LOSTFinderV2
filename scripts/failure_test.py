"""Automated failure tests with timings, for the report.

Start the whole system first (docker compose up), then in the project folder:
    pip install httpx PyJWT
    python scripts/failure_test.py                    # scenarios 1 and 2
    python scripts/failure_test.py --include-wipe     # also scenario 3 (deletes branch C's data!)

Scenario 1  A branch crashes and comes back
            - how fast the other branches notice (heartbeats)
            - the system keeps working: reports, search, and a claim for the dead branch is QUEUED
            - after restart: catch-up, queued claim delivered, all branches consistent
Scenario 2  RabbitMQ (the message broker) goes down
            - reports still work; events wait in the outbox; delivered when RabbitMQ is back
Scenario 3  A branch loses its whole database (optional)
            - after restart, resync rebuilds it from the other branches' copies

Results are printed and saved to docs/results/failure_test_<date>.md.
The docker commands can be replaced (see --help), e.g. to run branches without Docker.
"""
import argparse
import subprocess
import time
from datetime import datetime

import httpx

from _common import BRANCHES, NAMES, ROOT, is_up, load_env, new_user, report, wait_until
from check_consistency import check as consistency_check

results: list[tuple[str, str, str]] = []  # (check, outcome, detail)
failures = 0


def record(name: str, ok: bool, detail: str = ""):
    global failures
    results.append((name, "PASS" if ok else "FAIL", detail))
    failures += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{' · ' + detail if detail else ''}")


def run(cmd: str):
    print(f"  $ {cmd}")
    subprocess.run(cmd, shell=True, cwd=ROOT, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)


def cluster_view(observer: str, target: str) -> str:
    peers = httpx.get(BRANCHES[observer] + "/cluster", timeout=3).json()["peers"]
    return next(p["status"] for p in peers if p["branch"] == target)


def consistent(timeout: float = 60):
    return wait_until(lambda: consistency_check()[0], timeout=timeout, every=0.5)


def scenario_crash(args, victim: str):
    others = [b for b in BRANCHES if b != victim]
    a, b = others
    print(f"\n=== Scenario 1: {NAMES[victim]} (branch {victim}) crashes and comes back")
    _, finder = new_user(victim, "finder")
    item = report(victim, finder, title="Black wallet (failure test)", category="wallet", colour="black",
                  verification_question="What is inside?")
    _, ok_s = wait_until(lambda: httpx.get(f"{BRANCHES[a]}/items/{item['id']}").status_code == 200, 20)
    claimant_email, claimant = new_user(a, "claimant")
    wait_until(lambda: all(httpx.post(BRANCHES[x] + "/auth/login", data={"username": claimant_email, "password": "test-pass-123"}).status_code == 200 for x in BRANCHES), 20)

    t_stop = time.perf_counter()
    run(args.stop_branch.format(b=victim.lower(), B=victim))
    _, gone_s = wait_until(lambda: not is_up(victim), 30)
    _, detect_s = wait_until(lambda: cluster_view(a, victim) == "down" and cluster_view(b, victim) == "down", 60)
    detect_total = time.perf_counter() - t_stop
    record(f"Other branches detect {NAMES[victim]} is down", cluster_view(a, victim) == "down",
           f"{detect_total:.1f} s after the crash (heartbeat every 5 s, down after 3 misses)")

    # The system keeps working without the victim
    new_items, write_ok = [], 0
    for i, src in enumerate([a, b, a, b, a]):
        try:
            new_items.append(report(src, new_user(src, "writer")[1], title=f"Reported during outage {i}")["id"])
            write_ok += 1
        except httpx.HTTPError:
            pass
    record("Reports still accepted while a branch is down", write_ok == 5, f"{write_ok}/5 reports saved at the other branches")
    found = httpx.get(BRANCHES[a] + "/items", params={"q": "Black wallet"}).json()["total"]
    record(f"{NAMES[victim]}'s items still searchable elsewhere", found >= 1, f"search at {NAMES[a]} found {found}")
    r = httpx.post(f"{BRANCHES[a]}/items/{item['id']}/claims", headers=claimant, json={"answer": "Two bus tickets"})
    record("Claim for the dead branch's item is queued, not lost", r.status_code == 202,
           f"HTTP {r.status_code}: {r.json().get('message', r.json().get('detail', ''))[:70]}")

    # Recovery
    t_start = time.perf_counter()
    run(args.start_branch.format(b=victim.lower(), B=victim))
    _, restart_s = wait_until(lambda: is_up(victim), 120)
    record(f"{NAMES[victim]} back online", is_up(victim), f"{restart_s:.1f} s to answer /health")
    _, catch_s = wait_until(lambda: all(httpx.get(f"{BRANCHES[victim]}/items/{i}").status_code == 200 for i in new_items), 60)
    record("It catches up on the reports it missed", catch_s < 60,
           f"all {len(new_items)} reports present {time.perf_counter() - t_start:.1f} s after restart")
    delivered, deliver_s = wait_until(lambda: next((q for q in httpx.get(BRANCHES[a] + "/claims/queued/mine", headers=claimant).json()
                                                   if q["item_id"] == item["id"] and q["status"] == "DELIVERED"), None), 60)
    record("Queued claim delivered automatically", bool(delivered),
           f"{time.perf_counter() - t_start:.1f} s after restart" if delivered else "not delivered")
    status_ok, _ = wait_until(lambda: httpx.get(f"{BRANCHES[a]}/items/{item['id']}").json()["status"] == "CLAIMED", 30)
    record("The claim was decided at the item's home branch", bool(status_ok), "item is CLAIMED on every branch" if status_ok else "")
    ok, cons_s = consistent()
    record("All branches consistent again", bool(ok), f"{time.perf_counter() - t_start:.1f} s after restart")


def scenario_broker(args):
    a, b, c = BRANCHES
    print("\n=== Scenario 2: RabbitMQ goes down")
    _, writer = new_user(a, "broker")
    run(args.stop_broker)
    time.sleep(3)
    try:
        item = report(a, writer, title="Reported while RabbitMQ is down")
        saved = True
    except httpx.HTTPError:
        saved = False
    record("Reports still accepted without RabbitMQ", saved, "saved at Campus")
    pending, _ = wait_until(lambda: httpx.get(BRANCHES[a] + "/replication/status").json()["outbox_pending"] > 0, 10)
    outbox = httpx.get(BRANCHES[a] + "/replication/status").json()["outbox_pending"]
    record("Event waits in the outbox (not lost)", outbox > 0, f"outbox_pending = {outbox}")
    t_start = time.perf_counter()
    run(args.start_broker)
    _, deliver_s = wait_until(lambda: all(httpx.get(f"{BRANCHES[x]}/items/{item['id']}").status_code == 200 for x in (b, c)), 120)
    record("Event delivered once RabbitMQ is back", deliver_s < 120,
           f"item visible on all branches {time.perf_counter() - t_start:.1f} s after RabbitMQ restart")
    _, empty_s = wait_until(lambda: httpx.get(BRANCHES[a] + "/replication/status").json()["outbox_pending"] == 0, 60)
    record("Outbox empty again", empty_s < 60)


def scenario_wipe(args, victim: str):
    print(f"\n=== Scenario 3: {NAMES[victim]} loses its whole database")
    own_before = httpx.get(BRANCHES[victim] + "/items", params={"branch": victim, "limit": 1}).json()["total"]
    env = load_env()
    run(args.stop_branch.format(b=victim.lower(), B=victim))
    run(args.wipe_db.format(b=victim.lower(), B=victim, pg_user=env.get("POSTGRES_USER", "postgres")))
    t_start = time.perf_counter()
    run(args.start_branch.format(b=victim.lower(), B=victim))
    wait_until(lambda: is_up(victim), 120)
    back, rebuild_s = wait_until(
        lambda: httpx.get(BRANCHES[victim] + "/items", params={"branch": victim, "limit": 1}).json()["total"] >= own_before, 120)
    record(f"{NAMES[victim]} rebuilt its own items from the other branches' copies", bool(back),
           f"{own_before} items restored {time.perf_counter() - t_start:.1f} s after restart")
    ok, _ = consistent(90)
    record("All branches consistent after the rebuild", bool(ok), f"{time.perf_counter() - t_start:.1f} s after restart")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--victim", default="C", choices=list(BRANCHES), help="branch to crash (default C)")
    p.add_argument("--include-wipe", action="store_true", help="also run scenario 3 (deletes the victim's database!)")
    p.add_argument("--stop-branch", default="docker compose stop branch-{b}")
    p.add_argument("--start-branch", default="docker compose start branch-{b}")
    p.add_argument("--stop-broker", default="docker compose stop rabbitmq")
    p.add_argument("--start-broker", default="docker compose start rabbitmq")
    p.add_argument("--wipe-db", default='docker compose exec -T db-{b} psql -U {pg_user} -d branch_{b} -c '
                   '"TRUNCATE users, items, claims, matches, outbox_events, queued_requests CASCADE"')
    args = p.parse_args()

    if not all(is_up(b) for b in BRANCHES):
        raise SystemExit("All three branches must be running: docker compose up")
    started = datetime.now()
    print("Initial state:")
    ok, _ = consistent(30)
    record("Branches consistent before the tests", bool(ok))
    scenario_crash(args, args.victim)
    scenario_broker(args)
    if args.include_wipe:
        scenario_wipe(args, args.victim)

    out = ROOT / "docs" / "results" / f"failure_test_{started:%Y-%m-%d_%H%M}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"# Failure test results ({started:%Y-%m-%d %H:%M})", "",
             f"{len(results) - failures} of {len(results)} checks passed.", "",
             "| Check | Result | Details |", "|---|---|---|"]
    lines += [f"| {n} | {o} | {d} |" for n, o, d in results]
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n{len(results) - failures}/{len(results)} checks passed. Report saved to {out}")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
