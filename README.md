# LostFinder: Distributed Lost and Found Property Management System

Final project for the Distributed Systems module.
**Phase 4: Smart features.** Three branches, each with its own PostgreSQL database, kept in sync through RabbitMQ; shared photo storage; a Next.js + Tailwind web app; **automatic matching** of lost and found items, **live notifications** over WebSockets, and **safe claims** (only one claim per item can succeed).

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
             └──── photos: shared folder (default) or Cloudinary (free cloud) ───────────┘
```

---

## Quick start

You need **Docker Desktop** (running) and **Node.js 20 or newer**.

**1. Create your private settings file (first time only)**
```powershell
cd lostfinder
copy .env.example .env        # macOS/Linux: cp .env.example .env
notepad .env                  # replace every "change-me" value
```
Use only letters, digits, `-` and `_` in the passwords. To make a strong random value:
`python -c "import secrets; print(secrets.token_urlsafe(32))"`

**2. Start the back end**
```powershell
docker compose down -v        # only when upgrading from an earlier phase: the database tables changed
docker compose up --build
```
Wait until each branch shows `consumer listening on branch-A` (and `branch-B`, `branch-C`). A few `retrying in 3s` warnings at the start are normal while RabbitMQ boots.

**3. Start the web app** (second terminal)
```powershell
cd frontend
npm install          # first time only
npm run dev
```
Open **http://localhost:3000**.

**4. Demo data (optional, third terminal)**
```powershell
pip install httpx
python scripts/seed_demo.py      # 12 items + logins aline@demo.rw / eric@demo.rw, password demo1234
```

**5. Make a staff account** (needed to approve claims)
Open http://localhost:8001/docs → **Authorize** → log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env` → `POST /users`:
```json
{"full_name": "Grace Staff", "email": "grace@staff.rw", "password": "secret123", "role": "staff", "branch_id": "B"}
```
Grace can now use the **Staff desk** for the Bus Park branch. The account is copied to every branch.

| What | Address |
|---|---|
| Web app | http://localhost:3000 |
| Branch APIs | http://localhost:8001/docs, :8002/docs, :8003/docs |
| RabbitMQ dashboard | http://localhost:15672 (login = `RABBITMQ_USER` / `RABBITMQ_PASSWORD` from `.env`) |

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

## What's new in Phase 4

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
- A claim is **always decided at the item's home branch**, its primary. If you're using another branch, your request is **forwarded there over HTTP**. If the home branch is down, you get a clear "try again later" instead of an unsafe decision.
- At the home branch, the item's row is **locked** (`SELECT … FOR UPDATE`) while the claim is checked and saved. When two people claim at the same instant, the second waits, sees `CLAIMED`, and is refused (`409`). **Exactly one claim can succeed.**
- Claims get a **version number** and are **replicated**, so the claimant sees the decision from any branch.
- **Staff desk** (`/staff`): staff of the home branch see the claimant's answer and contact details, then **Approve / Reject** (with a note) and **Mark as handed over**. They can do this from any branch, because the requests are forwarded.

### New endpoints
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
6. **Failure:** `docker compose stop branch-b`, then try to claim a Bus Park item from Campus: "The Bus Park branch, which handles this item, is offline right now". Searching still works everywhere. `docker compose start branch-b` and it works again.

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
├── docker-compose.yml        # 3 databases + 3 branches + RabbitMQ (+ optional SeaweedFS)
├── docs/screenshots/         # screenshots for your report
├── scripts/
│   ├── seed_demo.py          # demo users and items
│   ├── demo_replication.py   # Phase 2 demo
│   └── demo_claims.py        # Phase 4 demo: two simultaneous claims, one wins
├── backend/                  # FastAPI branch server (same code for A, B and C)
│   ├── .env.example          # only for running without Docker
│   ├── app/
│   │   ├── config.py         # settings (reads .env)
│   │   ├── models.py         # items, users, claims, matches, outbox
│   │   ├── replication.py    # outbox, publisher, consumer, applying events
│   │   ├── matching.py       # scoring and deterministic matches
│   │   ├── notifier.py       # WebSocket connections and pushing messages
│   │   ├── announce.py       # notification texts
│   │   ├── storage.py        # photos: shared folder, Cloudinary, SeaweedFS
│   │   └── routers/          # health, auth, branches, items, photos, claims, live (ws + activity), replication
│   └── tests/                # 71 automated tests
└── frontend/                 # Next.js + Tailwind web app
    └── src/
        ├── app/              # /, search, report, items/[id], my-items, staff, status, login, register
        ├── components/       # Navbar, NotificationBell, Toaster, ClaimPanel, ClaimCard, ItemMatches…
        └── lib/              # API helper, login state, notifications (WebSocket), heartbeat checker
```

## Tests
```powershell
cd backend
pip install -r requirements.txt
python -m pytest -q          # 71 passed (no PostgreSQL, RabbitMQ or internet needed)
cd ../frontend
npm run lint                 # TypeScript check
npm run build                # production build
```

## Troubleshooting
- **`required variable … is missing a value`:** `.env` is missing or incomplete. Copy `.env.example` to `.env` and fill it in.
- **Branches can't log in to the database after you changed `POSTGRES_PASSWORD`:** the databases keep the old password. Run `docker compose down -v` (deletes data), then `docker compose up`.
- **RabbitMQ dashboard says "invalid credentials":** use `RABBITMQ_USER` / `RABBITMQ_PASSWORD` from `.env`, not guest/guest.
- **Upload or a new feature says "Not Found":** the containers run old code. Run `docker compose up --build`.
- **No pop-ups:** the bell icon is crossed out while the WebSocket is reconnecting. Check that the branch you selected is online.
- **Claim says the home branch is offline:** start that branch (`docker compose start branch-b`). Claims are only decided at the item's home branch, so they're never decided twice.
- **Photo upload fails:** the reason is shown under the photo. *Cloudinary refused … Invalid Signature* means `CLOUDINARY_URL` is mistyped.

## Next: Phase 5
Fault tolerance: a heartbeat monitor, automatic failover in the web app, and queueing claims while a home branch is down.
