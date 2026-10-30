# Distributed Lost and Found Property Management System

Final project for the Distributed Systems module.
**Phase 1: Setup and foundation.** One branch (Campus, Branch A) with its own PostgreSQL database.

Everything runs on your own computer. Nothing is deployed online and nothing costs money.

---

## What Phase 1 contains

| Part | What it does |
|---|---|
| FastAPI back end (`backend/app`) | The API for one branch |
| PostgreSQL | This branch's own database |
| Tables | `branches`, `users`, `items`, `claims`, `matches` |
| Login | Sign-up, login with JWT tokens, roles: owner, finder, staff, admin |
| Items | Report LOST/FOUND items, search with filters, view, edit, delete |
| Health check | `GET /health`, used as the heartbeat in Phase 5 |
| Tests | 16 automated tests (`backend/tests`) |

Already prepared for Phase 2:
- Item ids are **UUIDs**, so two branches can never create the same id.
- Every item has a **`home_branch`** (the branch that owns it) and a **`version`** that goes up by 1 on every change.
- A branch **refuses to change an item owned by another branch** (HTTP 409).
- The branch name and database come from **environment variables**, so the same code can run as Branch A, B or C.

## Project structure

```
lost-and-found/
├── docker-compose.yml        # Phase 1: db-a + branch-a
├── README.md
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── app/
    │   ├── main.py           # starts the app, creates tables, seeds branches + admin
    │   ├── config.py         # BRANCH_ID, DATABASE_URL, JWT settings
    │   ├── database.py       # database connection
    │   ├── models.py         # the tables
    │   ├── schemas.py        # request / response shapes
    │   ├── security.py       # passwords, JWT, role checks
    │   └── routers/
    │       ├── health.py     # GET /health
    │       ├── auth.py       # register, login, me, admin creates users
    │       ├── branches.py   # GET /branches
    │       └── items.py      # report, search, view, edit, delete items
    └── tests/
        ├── conftest.py
        └── test_phase1.py
```

---

## Option 1: Run with Docker (recommended)

You need **Docker Desktop** installed and running.

```bash
cd lost-and-found
docker compose up --build
```

Then open **http://localhost:8001/docs**. This is FastAPI's built-in page where you can try every endpoint.

To stop: press `Ctrl+C`, or run `docker compose down`.
To also delete the database data: `docker compose down -v`.

## Option 2: Run without Docker

You need **Python 3.11+** and **PostgreSQL** installed.

1. Create the database (in pgAdmin, or in a terminal):
   ```bash
   psql -U postgres -c "CREATE DATABASE branch_a;"
   ```
2. Install the Python packages:
   ```bash
   cd lost-and-found/backend
   python -m venv venv
   # Windows:      venv\Scripts\activate
   # macOS/Linux:  source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Start Branch A (use your own PostgreSQL password):
   ```bash
   # macOS / Linux
   export BRANCH_ID=A BRANCH_NAME=Campus
   export DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/branch_a
   uvicorn app.main:app --port 8001 --reload
   ```
   ```powershell
   # Windows PowerShell
   $env:BRANCH_ID="A"; $env:BRANCH_NAME="Campus"
   $env:DATABASE_URL="postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/branch_a"
   uvicorn app.main:app --port 8001 --reload
   ```
4. Open **http://localhost:8001/docs**.

---

## Try it in 5 minutes (at http://localhost:8001/docs)

1. **`GET /health`**: you should see `"branch": "A"` and `"database": "ok"`.
2. **`POST /auth/register`**: create a finder:
   ```json
   {"full_name": "Eric Finder", "email": "eric@example.com", "password": "secret123", "role": "finder"}
   ```
3. Click **Authorize** (top right). Log in with `eric@example.com` / `secret123`.
4. **`POST /items`**: report a found item:
   ```json
   {"type": "FOUND", "category": "laptop", "colour": "black", "title": "Black HP laptop",
    "description": "Sticker on the lid", "location": "Library 2nd floor", "event_date": "2026-10-30"}
   ```
   The response shows `"home_branch": "A"` and `"version": 1`.
5. **`GET /items`**: search with `q=sticker`, `colour=black` or `type=FOUND`.
6. **`PATCH /items/{id}`**: change the location. `version` becomes 2.

### Default admin account
Created automatically on first start:
- Email: `admin@lostfound.local`
- Password: `admin123`

The admin can create staff accounts with **`POST /users`**:
```json
{"full_name": "Grace Staff", "email": "grace@example.com", "password": "secret123", "role": "staff", "branch_id": "A"}
```
Change the admin password and `JWT_SECRET` before showing the system to anyone.

---

## API summary

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/health` | anyone | Branch heartbeat |
| GET | `/branches` | anyone | List branches A, B, C |
| POST | `/auth/register` | anyone | Sign up as owner or finder |
| POST | `/auth/login` | anyone | Get a JWT token |
| GET | `/auth/me` | logged in | Your account |
| POST | `/users` | admin | Create staff or admin accounts |
| GET | `/users` | admin | List users |
| POST | `/items` | logged in | Report a LOST or FOUND item |
| GET | `/items` | anyone | Search: `q`, `type`, `category`, `colour`, `status`, `branch`, `date_from`, `date_to`, `limit`, `offset` |
| GET | `/items/{id}` | anyone | One item |
| PATCH | `/items/{id}` | reporter, branch staff, admin | Edit (status: staff/admin only); raises `version` |
| DELETE | `/items/{id}` | admin | Delete |

## Item status
`OPEN` → `MATCHED` → `CLAIMED` → `RETURNED`
(`MATCHED` and `CLAIMED` are used from Phase 4.)

---

## Run the tests

The tests use a temporary SQLite file, so they don't need PostgreSQL:

```bash
cd backend
pip install -r requirements.txt
python -m pytest -q
```

Expected: `16 passed`.

---

## Next: Phase 2

Phase 2 copies this pattern three times:
- `db-b` + `branch-b` (port 8002) and `db-c` + `branch-c` (port 8003) in `docker-compose.yml`
- RabbitMQ, so every branch publishes `item.created` / `item.updated` and the others save a copy
