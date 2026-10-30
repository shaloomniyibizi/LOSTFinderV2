# Distributed Lost and Found Property Management System

Final project for the Distributed Systems module.
**Phase 2: Distributed core.** Three branches, each with its own PostgreSQL database, kept in sync through RabbitMQ.

Everything runs on your own computer. Nothing is deployed online and nothing costs money.

```
            Branch A (Campus)        Branch B (Bus Park)       Branch C (Airport)
            localhost:8001           localhost:8002            localhost:8003
                 │                        │                         │
            database A               database B                database C
                 │                        │                         │
                 └──────────── RabbitMQ (localhost:15672) ──────────┘
                       every change is sent to every branch
```

---

## What changed since Phase 1

### One role for the public: `user`
- The old `owner` and `finder` roles are merged into **`user`**.
- **Every user can report both LOST and FOUND items.**
- Roles are now: `user`, `staff` (works at a branch), `admin`.
- Sign-up always creates a `user`. Staff and admins are created by an admin with `POST /users`.

### Replication between branches
- **Items** are copied to every branch: created, updated and deleted.
- **User accounts** are copied too, so you can sign up at one branch and log in at any branch.
- Search at any branch finds items from **all** branches. It reads only that branch's own database.
- Only an item's **home branch** can change it. Other branches refuse with `409`.
- New endpoint: **`GET /replication/status`** shows the RabbitMQ connection, events sent and received, unsent events, and item counts per home branch.

## How replication works

1. **Outbox.** When a branch saves a change, it also saves an *event* (`item.created`, `item.updated`, `item.deleted` or `user.created`) in its `outbox_events` table, **in the same transaction**. A change is never saved without its event.
2. **Publisher thread.** A background thread sends unsent events to the RabbitMQ exchange `lostfound.events`. It marks each one as sent after RabbitMQ confirms it. If RabbitMQ is down, events wait in the outbox and go out when it's back.
3. **One durable queue per branch** (`branch-A`, `branch-B`, `branch-C`). Every event goes to every queue. A queue keeps messages while its branch is offline.
4. **Consumer thread.** Each branch reads its own queue and applies events from the other branches:
   - a new item is **inserted**
   - an existing item is replaced **only if the event's `version` is higher**, so old or duplicate messages are ignored
   - a deleted item is removed
   - events from the branch itself are ignored

Link to the lecture: replicas on every node (GFS/HDFS), **one primary per item** that orders its changes (GFS primary), **version numbers** to detect stale copies (GFS chunk versions), and **push instead of polling** (Dropbox notifications).

---

## Project structure

```
lostfinder/
├── docker-compose.yml          # 3 databases + 3 branches + RabbitMQ
├── README.md
├── scripts/
│   └── demo_replication.py     # automatic Phase 2 demo
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── app/
    │   ├── main.py             # starts the app and the replication threads
    │   ├── config.py           # BRANCH_ID, DATABASE_URL, RABBITMQ_URL, JWT
    │   ├── database.py
    │   ├── models.py           # tables, including outbox_events
    │   ├── schemas.py
    │   ├── security.py
    │   ├── replication.py      # outbox, publisher, consumer, applying events
    │   └── routers/
    │       ├── health.py
    │       ├── auth.py
    │       ├── branches.py
    │       ├── items.py
    │       └── replication.py  # GET /replication/status
    └── tests/
        ├── conftest.py
        ├── test_phase1.py
        └── test_replication.py
```

---

## Upgrading from Phase 1

The database layout changed (new roles, new `outbox_events` table), so start with empty databases:

```powershell
cd lostfinder
docker compose down -v          # removes the old Phase 1 containers AND their data
docker compose up --build
```

If you changed the database user or password in your Phase 1 `docker-compose.yml`, use the new file as it is. It uses `postgres` / `postgres` for all three databases.

---

## Run with Docker (recommended)

Run this **in the folder that contains `docker-compose.yml`** (not inside `backend`):

```powershell
docker compose up --build
```

Wait until you see `Uvicorn running` three times and `consumer listening on branch-A`, `branch-B` and `branch-C`. Then open:

| What | Address |
|---|---|
| Branch A (Campus) API | http://localhost:8001/docs |
| Branch B (Bus Park) API | http://localhost:8002/docs |
| Branch C (Airport) API | http://localhost:8003/docs |
| RabbitMQ dashboard | http://localhost:15672 (login `guest` / `guest`) |

Default admin on every branch: `admin@lostfound.local` / `admin123`.

## Run without Docker

You need PostgreSQL and RabbitMQ installed on your computer.

1. Create three databases: `branch_a`, `branch_b`, `branch_c`.
2. Install the packages once: `cd backend`, then `pip install -r requirements.txt`.
3. Open **three terminals** in `backend` and start one branch in each (Windows PowerShell shown; use your PostgreSQL password):
   ```powershell
   # Terminal 1: Branch A
   $env:BRANCH_ID="A"; $env:BRANCH_NAME="Campus"
   $env:DATABASE_URL="postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/branch_a"
   $env:RABBITMQ_URL="amqp://guest:guest@localhost:5672/"
   uvicorn app.main:app --port 8001
   ```
   For terminals 2 and 3, use `B` / `Bus Park` / `branch_b` / port `8002` and `C` / `Airport` / `branch_c` / port `8003`.

---

## Phase 2 demo

### Automatic demo
With the system running, in another terminal:
```powershell
pip install httpx
python scripts/demo_replication.py
```
It signs up a user at A, logs in at B and C, reports a FOUND laptop at B and a LOST phone at A, checks that every branch has copies, updates the laptop at B, and shows that A refuses to edit it.

### By hand (in the browser)
1. **http://localhost:8001/docs** → `POST /auth/register` → create an account.
2. **http://localhost:8002/docs** → **Authorize** → log in with the same account. It works, because the account was copied.
3. On Branch B → `POST /items` → report a FOUND item. Note `"home_branch": "B"`.
4. **http://localhost:8003/docs** → `GET /items` → the item is there.
5. On Branch B → `PATCH /items/{id}` → change the location. On A or C, `GET /items/{id}` shows `"version": 2`.
6. On Branch A → `PATCH` the same item → `409`: *This item belongs to branch B*.

### Failure demo 1: a branch goes down and catches up
```powershell
docker compose stop branch-c
# report 2–3 items at Branch A or B (http://localhost:8001/docs)
docker compose start branch-c
```
After a few seconds, `GET /items` on Branch C (http://localhost:8003/docs) shows the items it missed. RabbitMQ kept them in queue `branch-C` (look at *Queues* in the dashboard while C is stopped).

### Failure demo 2: RabbitMQ goes down
```powershell
docker compose stop rabbitmq
# report an item at Branch A: it still works
# http://localhost:8001/replication/status shows "outbox_pending": 1
docker compose start rabbitmq
```
Within a few seconds the event is sent, `outbox_pending` goes back to 0, and the item appears on B and C.

---

## API summary

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/health` | anyone | Branch heartbeat |
| GET | `/branches` | anyone | List branches A, B, C |
| POST | `/auth/register` | anyone | Sign up (role is always `user`) |
| POST | `/auth/login` | anyone | Get a JWT token (works at any branch) |
| GET | `/auth/me` | logged in | Your account |
| POST | `/users` | admin | Create `user`, `staff` (with `branch_id`) or `admin` accounts |
| GET | `/users` | admin | List users |
| POST | `/items` | any logged-in user | Report a LOST **or** FOUND item |
| GET | `/items` | anyone | Search all branches' items: `q`, `type`, `category`, `colour`, `status`, `branch`, `date_from`, `date_to` |
| GET | `/items/{id}` | anyone | One item |
| PATCH | `/items/{id}` | reporter, staff of the home branch, admin | Edit (only at the home branch); raises `version` |
| DELETE | `/items/{id}` | admin | Delete (only at the home branch) |
| GET | `/replication/status` | anyone | Replication health and counters |

---

## Tests

```powershell
cd backend
python -m pytest -q
```
Expected: `29 passed`. The tests use a temporary SQLite file and don't need PostgreSQL or RabbitMQ.

## Notes and limits (for the report)
- If the same email signs up at two branches before they sync, each branch keeps its own account and logs a conflict warning. This is rare and acceptable for the project.
- Password **hashes** travel through RabbitMQ so users can log in anywhere. RabbitMQ stays on the private Docker network and is never exposed online.
- A brand-new branch receives events from the moment its queue exists. All three queues are created as soon as any branch starts, so A, B and C never miss anything.

## Next: Phase 3
Photo storage with SeaweedFS (hash-named files, deduplication) and the Next.js front end.
