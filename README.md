# LostFinder: Distributed Lost and Found Property Management System

Final project for the Distributed Systems module. **Version 1.0

Three branches, each with its own PostgreSQL database, kept in sync through RabbitMQ. The system includes shared photo storage, a Next.js + Tailwind web app, automatic matching, live notifications and safe claims. It also **keeps working when a branch, RabbitMQ or a database fails**, and it comes with automated failure, consistency, replication-lag and load tests (results in [`docs/TESTING.md`](docs/TESTING.md)). Admins manage every account from the web app.

| Document | For |
|---|---|
| [User guide](docs/USER_GUIDE.md) | how members, staff and admins use the system |
| [Architecture](docs/ARCHITECTURE.md) | components, data ownership, replication, claims, fault tolerance (with diagrams) |
| [API reference](docs/API.md) | every endpoint (generated from the code; also live at `http://localhost:8001/docs`) |
| [Testing](docs/TESTING.md) | test strategy and results |
| [Presentation demo](docs/DEMO_SCRIPT.md) | a 12-minute run-through for the final presentation |
| [Changelog](CHANGELOG.md) | what each phase added |

Everything runs on your own computer and nothing costs money. The only optional online part is Cloudinary's free plan for photos. All passwords and secrets live in a private **`.env`** file.

```
                         Web app (Next.js + Tailwind) — localhost:3000
                       (choose a branch · live notifications over WebSocket)
             ┌───────────────────────────┼───────────────────────────┐
     Branch A (Campus)           Branch B (Bus Park)          Branch C (Airport)
     localhost:8001              localhost:8002               localhost:8003
             │                           │                           │
        database A                  database B                  database C
             │                           │                           │
             └──── RabbitMQ: every change (items, users, claims) goes to every branch ────┘
             └──── claims are forwarded to the item's home branch over HTTP ─────────────┘
             └──── heartbeats every 5 s · queued claims · resync from peers after a failure ┘
             └──── photos: shared folder (default) or Cloudinary (free cloud) ───────────┘
```

---

## Quick start

You need **Docker Desktop** (running). Python is only needed for the demo-data and test scripts; Node.js only if you want to change the web app (see *Working on the web app* below).

**1. Create your private settings file (first time only)**
```powershell
cd lostfinder
copy .env.example .env        # macOS/Linux: cp .env.example .env
notepad .env                  # replace every "change-me" value
```
Use only letters, digits, `-` and `_` in the passwords. To make a strong random value:
`python -c "import secrets; print(secrets.token_urlsafe(32))"`

**2. Start everything** (databases, RabbitMQ, the three branches and the web app)
```powershell
lostfinder start              # macOS/Linux: ./lostfinder.sh start
```
The first build takes a few minutes (it downloads Python and Node.js packages). The command waits until every part is healthy, shows a status list and opens the browser.

<details><summary>Without the script</summary>

```powershell
docker compose up --build
```
Wait until each branch shows `consumer listening on branch-A` (and `branch-B`, `branch-C`). A few `retrying in 3s` warnings at the start are normal while RabbitMQ boots.
</details>

Coming from an earlier phase? Your data is kept: the branches add the new database columns by themselves when they start.

**3. Open the web app:** **http://localhost:3000**

**4. Demo data with pictures (optional)**
```powershell
lostfinder seed               # or: pip install -r scripts/requirements.txt; python scripts/seed_demo.py
```
It creates 38 lost and found reports with a picture each, 8 members, a staff account for each branch, possible matches, and 10 claims in every state (waiting, approved, handed over, rejected). It also spreads the report dates over the last 18 days so the dashboard charts show a trend.

| Login (password `demo1234`) | Try |
|---|---|
| `aline@demo.rw` | Member: matches, a claim waiting for review |
| `eric@demo.rw`, `daniel@demo.rw`, `sandrine@demo.rw`… | Other members (see `scripts/demo_data.json`) |
| `grace@staff.rw` / `olivier@staff.rw` / `ange@staff.rw` | Staff at Campus / Bus Park / Airport |
| `ADMIN_EMAIL` from `.env` | Admin: all branches |

Running it again does nothing (add `--force` to add everything again). The items, people and claims are in `scripts/demo_data.json` and the pictures in `scripts/demo_photos/`, so you can edit them. The pictures are original illustrations drawn for this project (from the ISC-licensed Lucide icon set), so they are free to use in your report.

**5. Make your own staff account** (optional: the demo data already has one per branch)
Open http://localhost:8001/docs → **Authorize** → log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env` → `POST /users`:
```json
{"full_name": "Grace Staff", "email": "grace@staff.rw", "password": "secret123", "role": "staff", "branch_id": "B"}
```
Grace can now use the **Staff desk** for the Bus Park branch. The account is copied to every branch.

| What | Address |
|---|---|
| Web app (container `web`) | http://localhost:3000 |
| Branch APIs | http://localhost:8001/docs, :8002/docs, :8003/docs |
| RabbitMQ dashboard | http://localhost:15672 (login = `RABBITMQ_USER` / `RABBITMQ_PASSWORD` from `.env`) |

---

### Working on the web app
The `web` container runs a production build, so changes to `frontend/src` show up only after `docker compose up --build web`. While you are changing the web app, use the development server instead, which reloads instantly. You need Node.js 20 or newer:
```powershell
docker compose stop web       # frees port 3000
cd frontend
npm install                   # first time only
npm run dev
```
When you're done: `docker compose start web` (or `up --build web` to include your changes).

The browser talks to the branches directly through `localhost:8001`, `:8002` and `:8003`. If you change those ports, set `WEB_BRANCH_A_URL`, `WEB_BRANCH_B_URL` and `WEB_BRANCH_C_URL` in `.env` and rebuild the web app (`docker compose up --build web`).

---

### All `lostfinder` commands
Windows: `lostfinder <command>` in the project folder (runs `lostfinder.cmd`). macOS/Linux: `./lostfinder.sh <command>`.

| Command | What it does |
|---|---|
| `start` | build and start everything, wait until healthy, open the browser |
| `stop` | stop everything (data is kept) |
| `status` | running containers and each branch's health |
| `seed` | add the demo data |
| `logs [service]` | follow the logs, e.g. `lostfinder logs branch-a` |
| `test` | run the 100 back-end tests in a temporary container (no Python needed) |
| `check` | are the three databases identical? |
| `failure-test` | crash a branch, stop RabbitMQ, wipe a database, and time the recovery |
| `backup` | save the three databases to `backups\<date>\` |
| `restore <folder>` | put a backup back (asks first) |
| `reset` | delete all data and start from empty (asks first) |

---

## Private settings (`.env`)

Nothing secret is written in the code or in `docker-compose.yml`. Docker Compose reads them from `.env`:

| Setting | What it is |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | Login for the three databases. Changing them later needs `docker compose down -v`. |
| `JWT_SECRET` | Signs login tokens. One long random value, shared by all branches. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first admin account, created on every branch. |
| `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | RabbitMQ login, used by the branches and the dashboard. |
| `RABBITMQ_ERLANG_COOKIE` | RabbitMQ's internal secret. |
| `CLOUDINARY_URL` | Optional: photos in the Cloudinary free cloud (see below). Empty = shared folder. |
| `MATCH_THRESHOLD` | Optional: minimum match score (default 60). |

- If `.env` is missing or a value is empty, `docker compose up` **stops with a message naming the missing setting**.
- `.env` is listed in `.gitignore`, so it never goes to GitHub. Share `.env.example`, never `.env`.
- Running a branch without Docker? Copy `backend/.env.example` to `backend/.env`; the branch reads it at start-up.
- The branches log a warning if they start with the development default secret or admin password.

---

## What's new in Phase 6: delivery and user management

### User management (admins)
Sidebar → **Administration → User management**:
- Every account with its role, branch (staff), number of reports and claims, and status. Search and filter by role or status.
- **Add user**: member, staff for a branch, or admin.
- **Edit**: name, phone, role, branch.
- **Reset password**: suggests a new password to give to the person.
- **Disable / Enable**: a disabled person can't sign in at any branch and is signed out immediately; their reports and claims stay.
- Safety: you can't disable yourself or remove your own admin role, and there is always at least one active admin.

Everyone can change their own name, phone and password in **My profile**.

**How it works in the distributed system:** accounts can be changed at any branch, so each account now has a **version**. Every change increases it and is sent to the other branches as a `user.updated` event. A branch keeps the copy with the higher version; if two branches changed the same account at the same moment, the later change wins. Resync snapshots include accounts too, so a branch that was offline catches up.

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/users?q=&role=&active=` | admin | Accounts with report and claim counts |
| GET | `/users/{id}` | admin | One account |
| PATCH | `/users/{id}` | admin | Change name, phone, role, branch, or `is_active` |
| POST | `/users/{id}/password` | admin | Set a new password |
| PATCH | `/auth/me` | signed in | Change your own name or phone |
| POST | `/auth/me/password` | signed in | Change your own password |

### Delivery
- **`lostfinder` command** for Windows, macOS and Linux (table above).
- **Health checks** for the branches and the web app, so `start` knows when everything is ready.
- **Backup and restore** of the three databases.
- **Automatic database upgrade:** branches add new columns on start-up, so moving to 1.0 keeps your data.
- **Documentation:** [user guide](docs/USER_GUIDE.md), [architecture](docs/ARCHITECTURE.md), [API reference](docs/API.md), [presentation demo](docs/DEMO_SCRIPT.md), [changelog](CHANGELOG.md).

---

## New user interface (dashboard design)

The web app now uses a dashboard layout: a **sidebar** on the left, a top bar, and **charts**. It has a **dark theme** by default and a light theme, chosen with the moon/sun button in the top bar.

| Page | What it shows |
|---|---|
| **Dashboard** `/dashboard` | *Members:* their open reports, matches, claims, recent notifications, reports per day (line chart), their lost reports by status, reports by category. *Staff and admin:* claims to review, awaiting handover, items in custody, returns, the claim queue, recent claim activity, claims by status, reports by category, reports by home branch, and the health of the branch network. |
| **Lost items** `/lost`, **Found items** `/found` | Banner, search and filters (category, branch), status tabs with counts, item cards |
| **Report lost item** / **Turn in found item** `/report` | Form in sections, with tips and "what happens next" |
| **My matches** `/matches` | Each match with its score ring, both items side by side, and **why it matched** (+40 same category, +20 same colour…) |
| **My claims** `/claims` | Progress steps *Submitted → In review → Approved → Collected*, ready-to-collect notice, claims on items you found, claims queued for an offline branch |
| **My reports**, **Notifications**, **My profile** | Your reports; a timeline of notifications; your account, connected branch and theme |
| **Security desk** `/staff` | Review queue, Awaiting handover, Closed |
| **Network status** `/status` | Each branch's health and a chart comparing each branch's copy of the data |
| Home page `/` (visitors) | Public landing page with a live network diagram, search, figures and the latest reports |
| Sign in / Register | A pop-up window with two tabs, available from every page |

**Visitors** (not signed in) see a simple top bar with *Lost items, Found items, How it works, Network status* and **no sidebar**. **Sign in** and **Register** open as a pop-up window over the current page, so after signing in you stay where you were (from the home page you go to your dashboard). The old links `/login` and `/register` still work: they open the same window, and `/login?next=/matches` goes to *My matches* after signing in.

The sidebar's badges (matches, review queue…) and the "Branch network" dots at the bottom update live. On a phone, the sidebar becomes a slide-in menu.

New back-end endpoints for the charts. Every branch has a full copy of the data, so **any branch can answer for the whole network**:

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/stats/overview` | anyone | Reports per day (14 days), by category, status and home branch; claims by stage; totals and return rate |
| GET | `/me/overview` | logged in | Your own figures (open reports, matches, claims…) |
| GET | `/me/matches` | logged in | Matches for all your items, with the reasons behind each score |

Screenshots: `docs/screenshots/16-…` to `26-…`.

---

## What's new in Phase 5: reliability

| Failure | What happens now |
|---|---|
| **A branch crashes** | Every branch sends a **heartbeat** to the others every 5 s. After 3 missed heartbeats, the others mark it *down*; the **Network status** page shows what each branch sees. Reports and searches continue at the other branches. |
| **You claim an item whose home branch is down** | The claim is **queued** (HTTP 202) at the branch you're using, instead of being refused. It is listed under **My reports → Claims waiting for an offline branch**, then **delivered automatically** when the home branch is back, and you get a notification. The claim is still decided only at the home branch. |
| **A branch was off and missed events** | **Anti-entropy resync:** it asks its peers for a snapshot of their data and applies anything newer (higher version wins). This runs at startup, whenever a peer comes back up, every 5 minutes, and on demand (`POST /replication/resync`, admin). |
| **RabbitMQ goes down** | Changes are still saved. Their events wait in the **outbox** and are sent once RabbitMQ is back. |
| **A branch loses its whole database** | After a restart, the resync **rebuilds** its data from the copies held by the other branches. |
| **The branch your browser uses goes down** | The web app notices after 2 missed heartbeats and **switches to another branch automatically**, with a message. |

Replication is also faster. The publisher used to check the outbox every 0.5 s. Now it is woken as soon as a change is saved, so the median replication lag fell from **310 ms to 9 ms**.

### New endpoints
| Method | Path | Who | What |
|---|---|---|---|
| GET | `/cluster` | anyone | This branch's view of its peers: up/down, last heartbeat, missed heartbeats |
| GET | `/claims/queued/mine` | logged in | Your claims waiting for an offline branch |
| GET | `/replication/snapshot` | branches only (internal token) | All data, used by resync |
| POST | `/replication/resync` | admin | Resync from all peers now |

`/replication/status` now also shows `queued_claims` and `last_resync`.

### Testing (details and results in [`docs/TESTING.md`](docs/TESTING.md))
Start the whole system (`docker compose up`), then in a second terminal in the project folder:
```powershell
pip install -r scripts/requirements.txt            # httpx, PyJWT, locust
python scripts/check_consistency.py --wait         # are all three databases identical?
python scripts/measure_replication.py --items 60   # replication lag → docs/results/replication_lag.csv
python scripts/failure_test.py                     # crash a branch + stop RabbitMQ, with timings
python scripts/failure_test.py --include-wipe      # also wipe branch C's database (it is rebuilt)
locust -f loadtest/locustfile.py --headless -u 60 -r 20 -t 45s --csv docs/results/load_3_branches
```
The scripts read `JWT_SECRET` from your `.env`. The failure test stops and starts containers itself and saves a report in `docs/results/`.

| Result (development machine) | |
|---|---|
| Automated tests | 100 passed |
| Failure test | 16 of 16 checks passed. Crash detected in 11.6 s; queued claim delivered 4.6 s after restart; consistent again 5.1 s after restart; wiped database rebuilt in 1.4 s |
| Replication lag | median 9.1 ms, p95 18.1 ms, 0 lost |
| Load (60 users) | searches: avg 46 ms over 3 branches vs 151 ms on 1 branch, 0 failures |

### Phase 5 demo (for the presentation)
1. Open **/status**: each branch card shows which peers it *sees*.
2. `docker compose stop branch-c`. Within about 15 s, Campus and Bus Park show Airport as **down**.
3. Log in on Campus and claim an Airport item. Instead of an error, you see **"Claim queued"**, and it appears under *My reports*.
4. `docker compose start branch-c`. Within a few seconds the claim is delivered, you get a pop-up, and **/status** shows all three in sync.
5. Select **Airport** in the web app, then stop it again: the app switches to another branch on its own.
6. Run `python scripts/failure_test.py --include-wipe` and show the generated report.

---

## Phase 4 features

### 1. Matching lost and found items
Every LOST report is compared with every active FOUND report of the same category (and the other way round), across **all branches**:

| Rule | Points |
|---|---|
| Same category | 40 (required) |
| Same colour (one missing: 10; different: 0) | 20 |
| Shared descriptive words in title/description | 10 each, max 20 |
| Found within 3 days after it was lost (within 14 days: 10) | 20 |
| Found more than a day *before* it was lost | no match |

Pairs scoring **60 or more** become *possible matches*, shown on both items' pages.

**Why it is safe in a distributed system without coordination:**
- Every branch runs matching on **its own copy** of the data, whenever an item is reported here *or arrives from another branch*. So a match is found even when the lost and the found item were reported at two different branches at the same moment.
- A match's ID is **derived from the two item IDs** (UUID v5). All branches create the *same* match, and a pair is never saved twice.
- Only an item's **home branch** changes it to `MATCHED`, because it is the item's primary.

### 2. Live notifications (WebSockets)
- The web app keeps one WebSocket open to the branch you are using, and reconnects automatically if it drops.
- You get a pop-up (and the **bell** shows a count) when:
  - an item matches one you reported
  - someone claims an item you found
  - your claim is approved, rejected or handed over
  - (staff) a new claim needs checking
- **Exactly once, wherever you are connected.** Each branch pushes only to its own users: for changes made there, right after saving; for changes made elsewhere, when the RabbitMQ event arrives.
- The bell's history (`GET /me/activity`) is built from replicated data, so it's the same on every branch.

### 3. Safe claims
```
  claim ──► PENDING ──approve──► APPROVED ──handover──► item RETURNED
                   └──reject───► REJECTED  (item can be claimed again)
```
- Anyone (except the finder) can claim a **FOUND** item by answering the finder's **question for the owner** (e.g. "What is the wallpaper picture?").
- A claim is **always decided at the item's home branch**, its primary. If you're using another branch, your request is **forwarded there over HTTP**. If the home branch is down, the claim is **queued** and delivered when it returns (Phase 5); it is never decided anywhere else.
- At the home branch, the item's row is **locked** (`SELECT … FOR UPDATE`) while the claim is checked and saved. When two people claim at the same instant, the second waits, sees `CLAIMED`, and is refused (`409`). **Exactly one claim can succeed.**
- Claims get a **version number** and are **replicated**, so the claimant sees the decision from any branch.
- **Staff desk** (`/staff`): staff of the home branch see the claimant's answer and contact details, then **Approve / Reject** (with a note) and **Mark as handed over**. They can do this from any branch, because the requests are forwarded.

### Phase 4 endpoints
| Method | Path | Who | What |
|---|---|---|---|
| GET | `/items/{id}/matches` | anyone | Possible matches, with score |
| POST | `/items/{id}/claims` | logged in | Claim a FOUND item (forwarded to its home branch) |
| GET | `/claims/mine` | logged in | Your claims |
| GET | `/claims?status=PENDING` | staff, admin | Claims on your branch's items (admin: all) |
| GET | `/items/{id}/claims` | home-branch staff, the finder | Claims on one item |
| POST | `/claims/{id}/approve`, `/reject`, `/handover` | home-branch staff, admin | Decide (forwarded to the home branch) |
| GET | `/me/activity` | logged in | Notification history for the bell |
| WS | `/ws?token=…` | logged in | Live notifications |

### Web app additions
- **Bell** with unread count, and **pop-ups** for live messages
- **Possible matches** section on every item page, with a score bar
- **Question for the owner** on the "I found something" form
- **"Is this yours?"** panel on found items: claim form, your claim's status, and claims list for staff and the finder
- **Staff desk**: *To verify* / *Waiting for collection* / *Closed*
- **My claims** on the My reports page
- Network status shows **live connections** per branch

---

## Phase 4 demo (for the presentation)

1. Open **/status** in one window: three green branches, *in sync*.
2. **Match + live notification across branches:** log in as user 1 with **Airport** selected and report a *lost* blue phone. In a second browser (or a private window), log in as user 2 with **Bus Park** selected and report a *found* blue phone with a *question for the owner*. User 1 gets a pop-up on Airport within a second.
3. **Claim through another branch:** user 1 opens the found phone (still on Airport), answers the question and clicks **Claim**. The claim is decided at Bus Park, the item's home.
4. **Race:** run `python scripts/demo_claims.py`. Two people claim the same item at the same instant from Campus and Airport; exactly one is accepted.
5. **Staff:** log in as Bus Park staff → **Staff desk** → *Approve*. User 1 gets "Your claim was approved". Then *Mark as handed over*: the item shows *Returned* on every branch.

---

## Earlier phases (summary)

**Phase 2: replication.** Each change and its event are saved in one transaction (outbox). A publisher thread sends events to RabbitMQ; every branch has a durable queue (kept while it's offline); a consumer applies other branches' events, and a higher `version` wins. Only the home branch changes an item.

**Phase 3: photos and web app.** Photos are stored outside the databases, named by their SHA-256 hash (deduplication), in a shared folder, Cloudinary, or SeaweedFS. The web app has search, report with photo, item pages (original vs copy), branch switcher, branch-down banner, and the live **Network status** dashboard.

### Using Cloudinary (free cloud) for photos
1. Sign up free at **https://cloudinary.com/users/register_free**. No credit card is needed.
2. At **https://console.cloudinary.com** → gear icon → **API Keys**, copy the **API environment variable** (`cloudinary://KEY:SECRET@CLOUD_NAME`).
3. Paste it into `.env` as `CLOUDINARY_URL=…`, then run `docker compose up -d --force-recreate branch-a branch-b branch-c`.
4. **/status** should show *Photo storage: cloudinary* on every branch.

---

## Project structure
```
lostfinder/
├── .env.example              # copy to .env: all private settings
├── lostfinder.cmd            # Windows: lostfinder start / stop / seed / test / backup …
├── lostfinder.sh             # the same for macOS and Linux
├── CHANGELOG.md
├── docker-compose.yml        # 3 databases + 3 branches + RabbitMQ + web app (+ optional SeaweedFS)
├── docs/
│   ├── ARCHITECTURE.md       # how it works, with diagrams
│   ├── USER_GUIDE.md         # for members, staff and admins
│   ├── API.md                # endpoint reference (scripts/make_api_docs.py)
│   ├── DEMO_SCRIPT.md        # presentation run-through
│   ├── TESTING.md            # test strategy and results
│   ├── results/              # failure-test report, replication lag and load-test CSVs
│   └── screenshots/          # screenshots for your report
├── loadtest/locustfile.py    # Locust load test
├── scripts/
│   ├── requirements.txt      # pip install -r scripts/requirements.txt
│   ├── seed_demo.py          # demo users and items
│   ├── demo_replication.py   # Phase 2 demo
│   ├── demo_claims.py        # Phase 4 demo: two simultaneous claims, one wins
│   ├── check_consistency.py  # compare the three databases
│   ├── measure_replication.py# replication lag
│   └── failure_test.py       # crash / broker / wipe scenarios with timings
├── backend/                  # FastAPI branch server (same code for A, B and C)
│   ├── .env.example          # only for running without Docker
│   ├── app/
│   │   ├── config.py         # settings (reads .env)
│   │   ├── models.py         # items, users, claims, matches, outbox
│   │   ├── replication.py    # outbox, publisher, consumer, applying events
│   │   ├── reliability.py    # heartbeats, queued claims, snapshots and resync
│   │   ├── database.py       # connection + automatic upgrade of older databases
│   │   ├── matching.py       # scoring and deterministic matches
│   │   ├── notifier.py       # WebSocket connections and pushing messages
│   │   ├── announce.py       # notification texts
│   │   ├── storage.py        # photos: shared folder, Cloudinary, SeaweedFS
│   │   └── routers/          # health, auth, branches, items, photos, claims, live (ws + activity), replication, stats
│   └── tests/                # 100 automated tests
└── frontend/                 # Next.js + Tailwind web app (Dockerfile builds the `web` container)
    └── src/
        ├── app/              # /, dashboard, lost, found, search, report, items/[id], matches, claims, my-items,
        │                     # notifications, profile, staff, status, login, register
        ├── components/       # layout/ (Sidebar, Topbar, AppShell), charts, ItemCard, ItemsBrowser, ClaimPanel…
        └── lib/              # API helper, login state, notifications (WebSocket), heartbeat checker
```

## Tests
```powershell
lostfinder test              # 100 passed, in a container (no local Python needed)
# or, with Python installed:
cd backend
pip install -r requirements.txt
python -m pytest -q          # no PostgreSQL, RabbitMQ or internet needed
cd ../frontend
npm run lint                 # TypeScript check
npm run build                # production build
```

## Troubleshooting
- **`required variable … is missing a value`:** `.env` is missing or incomplete. Copy `.env.example` to `.env` and fill it in.
- **Branches can't log in to the database after you changed `POSTGRES_PASSWORD`:** the databases keep the old password. Run `docker compose down -v` (deletes data), then `docker compose up`.
- **RabbitMQ dashboard says "invalid credentials":** use `RABBITMQ_USER` / `RABBITMQ_PASSWORD` from `.env`, not guest/guest.
- **Upload or a new feature says "Not Found", or the web app looks old:** the containers run old code. Run `docker compose up --build`.
- **`port is already allocated` for 3000:** `npm run dev` (or another program) is already using port 3000. Stop it, or run `docker compose stop web` and keep using `npm run dev`.
- **No pop-ups:** the bell icon is crossed out while the WebSocket is reconnecting. Check that the branch you selected is online.
- **Claim says "queued":** the item's home branch is offline. Start it (`docker compose start branch-b`) and the claim is delivered within a few seconds.
- **`relation "queued_requests" does not exist`:** you upgraded from Phase 4 without resetting. Run `lostfinder reset`, then `lostfinder start`.
- **`lostfinder` is not recognized:** run it from the project folder (where `lostfinder.cmd` is). In PowerShell, type `.\lostfinder start`.
- **"This account has been disabled":** an admin disabled it; another admin can enable it in User management.
- **Scripts say `JWT_SECRET` is missing:** run them from the project folder (where `.env` is).
- **`failure_test.py` stops at a docker command:** the whole system must have been started with `docker compose up` from the project folder.
- **Photo upload fails:** the reason is shown under the photo. *Cloudinary refused … Invalid Signature* means `CLOUDINARY_URL` is mistyped.

## Next steps
All six phases are done; this is version 1.0. For the final report and presentation:
- Follow [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the live demo.
- Run the tests in [docs/TESTING.md](docs/TESTING.md) on your own computer and use your own numbers.
- Ideas for future work: HTTPS and rate limiting, a real search engine (e.g. Meilisearch) for fuzzy matching, image similarity for matching photos, more than one replica per branch, running across several computers on a LAN, and an audit log of admin actions.
