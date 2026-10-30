# Testing and reliability (Phase 5)

This document explains how LostFinder was tested and lists the results. Each kind of test below has its own command, so every number here can be reproduced on your computer.

| Level | What it checks | Tool | Command |
|---|---|---|---|
| Unit and integration | API rules, replication, matching, claims and reliability logic, one branch at a time | pytest | `cd backend && pytest -q` |
| Consistency | All three databases hold the same items, users and claims | `scripts/check_consistency.py` | `python scripts/check_consistency.py --wait` |
| Replication lag | Time for a new report to appear at the other branches | `scripts/measure_replication.py` | `python scripts/measure_replication.py --items 60` |
| Failure (end to end) | A crashed branch, a broker outage and a wiped database | `scripts/failure_test.py` | `python scripts/failure_test.py --include-wipe` |
| Load | Response times with many users, 1 branch compared with 3 | Locust | see [Load test](#4-load-test) |

Set up the scripts once with `pip install -r scripts/requirements.txt`. They read `JWT_SECRET` from the project's `.env`, and they need all three branches to be running (`docker compose up`).

## 1. Unit and integration tests (pytest)

These tests run against SQLite with the background threads switched off (`BACKGROUND_TASKS=0`), so they are fast and need neither Docker nor RabbitMQ.

| File | Covers |
|---|---|
| `test_phase1.py` | Sign-up and login, roles, reporting items, search, versions, home-branch rule |
| `test_replication.py` | Outbox events, applying remote events, conflict rule (higher version wins) |
| `test_photos.py`, `test_cloudinary.py` | Photo upload to the shared folder and to Cloudinary |
| `test_matching.py` | Match scoring, deterministic match IDs, threshold |
| `test_claims.py` | Claim flow, verification answer, two claims at once, forwarding to the home branch |
| `test_reliability.py` | Heartbeat monitor, store-and-forward queue, snapshots and resync, internal token, same admin ID on every branch |

**Result: 86 passed.**

## 2. Replication lag

The script reports items at A, B and C in turn and checks the other two branches every 20 ms until each item appears there.

| Version | Copies | Median | p95 | Max | Lost |
|---|---|---|---|---|---|
| Before: publisher checked the outbox every 0.5 s | 120 | 310.6 ms | 462.5 ms | 481.6 ms | 0 |
| After: publisher woken immediately when a report is saved | 120 | **9.1 ms** | **18.1 ms** | 41.7 ms | 0 |

The test showed that most of the delay came from the publisher's polling interval, not from RabbitMQ. A SQLAlchemy `after_commit` hook now wakes the publisher as soon as a transaction that wrote an outbox event has committed. A 0.5 s poll is still kept as a safety net. Saving a report at its home branch takes a median of 18.6 ms.

Raw data: `results/replication_lag_before_wakeup.csv` and `results/replication_lag.csv`.

## 3. Failure tests

`failure_test.py` breaks the system on purpose and times how long the system takes to recover. By default it uses `docker compose stop/start`. Every command can be changed with options (see `--help`).

| Check | Result | Measured |
|---|---|---|
| Branches consistent before the tests | PASS | |
| **Scenario 1: Airport branch crashes** | | |
| Other branches detect Airport is down | PASS | 11.6 s (heartbeat every 5 s, down after 3 misses) |
| Reports still accepted while a branch is down | PASS | 5/5 saved |
| Airport's items still searchable elsewhere | PASS | |
| Claim for the dead branch's item is queued, not lost | PASS | HTTP 202 |
| Airport back online | PASS | 1.1 s |
| It catches up on the reports it missed | PASS | 1.3 s after restart |
| Queued claim delivered automatically | PASS | 4.6 s after restart |
| The claim was decided at the item's home branch | PASS | |
| All branches consistent again | PASS | 5.1 s after restart |
| **Scenario 2: RabbitMQ goes down** | | |
| Reports still accepted without RabbitMQ | PASS | |
| Event waits in the outbox (not lost) | PASS | 2 pending |
| Event delivered once RabbitMQ is back | PASS | 2.9 s |
| Outbox empty again | PASS | |
| **Scenario 3: Airport loses its whole database** | | |
| Airport rebuilt its own items from the other branches' copies | PASS | 1.4 s after restart |
| All branches consistent after the rebuild | PASS | 1.6 s after restart |

**Result: 16 of 16 checks passed.** Full report: `results/failure_test_2026-10-30_2320.md`.

These runs used real PostgreSQL and RabbitMQ on the development machine, started without Docker, so `--stop-branch` and the other commands were replaced by equivalent local commands. With Docker, run the script with its defaults.

### Which feature makes each scenario pass

| Problem | Mechanism |
|---|---|
| Notice that a branch is down | Heartbeat every 5 s to each peer; a peer is marked *down* after 3 missed heartbeats (`GET /cluster`) |
| Claim for an item whose home branch is down | Store-and-forward: the claim is saved as a `QueuedRequest` (HTTP 202) and delivered when the branch returns, and the user is notified |
| A branch missed events while it was off | Anti-entropy resync: it pulls snapshots from its peers at startup, when a peer comes back, every 5 minutes, and on `POST /replication/resync` |
| RabbitMQ down | Outbox pattern: events are saved in the same transaction as the data and published later |
| Database lost | The resync rebuilds the branch's own items from its peers' copies |
| A branch goes offline while someone is using the web app | The front end switches to another branch after 2 missed heartbeats and shows a message |

## 4. Load test

60 virtual users sign up, then search (60% of actions), open items (30%) and report items (10%), waiting 0.5–2 s between actions, for 45 seconds.

```bash
# 3 branches (users spread over Campus, Bus Park and Airport)
locust -f loadtest/locustfile.py --headless -u 60 -r 20 -t 45s --csv docs/results/load_3_branches
# 1 branch (everyone uses Campus)
LOCUST_BRANCHES=http://localhost:8001 locust -f loadtest/locustfile.py --headless -u 60 -r 20 -t 45s --csv docs/results/load_1_branch
```

On Windows PowerShell, set the variable first with `$env:LOCUST_BRANCHES="http://localhost:8001"`.

| Request | 1 branch: avg / p95 / p99 | 3 branches: avg / p95 / p99 |
|---|---|---|
| Search `GET /items?q=` | 151 / 290 / 4600 ms | **46 / 81 / 440 ms** |
| View `GET /items/{id}` | 29 / 77 / 250 ms | **13 / 37 / 88 ms** |
| Report `POST /items` | 278 ms avg | 193 ms avg |
| Throughput | 32.6 req/s, 0 failures | 32.1 req/s, 0 failures |

Spreading the users over three branches cut average search time by about 3× and cut the slowest 1% of searches from 4.6 s to 0.44 s. Throughput is the same in both runs because it is set by the users' think time, not by the server. Sign-up and login were slow in both runs (around 6–7 s) because 60 users signed up within 3 seconds and password hashing is deliberately slow. This happens once per user and is not part of normal browsing.

These figures come from the development machine, where all three branches shared one CPU. Your numbers will differ. Run the commands above on your own computer and put your results in the report. Raw data: `results/load_*_stats.csv`.

## 5. Manual checks (for the demo)

1. Open the **Status** page, then stop a branch with `docker compose stop branch-c`. Within about 15 s the other branches show it as *down*.
2. While it is down, claim one of its items. The claim appears under **My items → Claims waiting for an offline branch**.
3. Run `docker compose start branch-c`. The claim is delivered and you get a notification.
4. With the web app connected to a branch, stop that branch. The app switches to another branch and shows a message.
