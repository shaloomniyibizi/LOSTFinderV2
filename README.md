# LostFinder: Distributed Lost and Found Property Management System

Final project for the Distributed Systems module.
**Phase 3: Photos and user interface.** Three branches, each with its own PostgreSQL database, kept in sync through RabbitMQ, shared photo storage (a local shared folder, or the free Cloudinary cloud service), and a Next.js + Tailwind CSS web app.

Everything runs on your own computer and nothing costs money. The only optional online part is Cloudinary's free plan for photos.

```
                         Web app (Next.js + Tailwind) — localhost:3000
                                         │  (choose a branch in the menu)
             ┌───────────────────────────┼───────────────────────────┐
     Branch A (Campus)           Branch B (Bus Park)          Branch C (Airport)
     localhost:8001              localhost:8002               localhost:8003
             │                           │                           │
        database A                  database B                  database C
             │                           │                           │
             └────────── RabbitMQ: every change goes to every branch ┘
             └────────── Photos: shared folder (default) or Cloudinary (free cloud) ┘
```

---

## What's new in Phase 3

### Photo storage
- Photos are stored **outside the databases**. The database only keeps the photo's **SHA-256 hash**, just like GFS keeps metadata on the master and data on chunkservers.
- The photo's **name is its hash**, so the same photo uploaded twice is stored **once** (deduplication, as in Dropbox).
- All branches use the **same photo store**, so every branch can show every photo.
- Choose where photos live (the code is the same for all three):

  | Option | Setup | Notes |
  |---|---|---|
  | **Shared folder** (default) | None | A Docker volume used by all three branches. Works offline. |
  | **Cloudinary** (free cloud) | Free account + one line in `.env` | 25 free credits a month, no credit card. Photos load from Cloudinary's fast servers. Needs internet. |
  | **SeaweedFS** (self-hosted) | `--profile seaweedfs` | Optional extra: your own distributed file store. |

- The file's real type is checked from its first bytes, not its name. Only JPEG, PNG or WebP up to 5 MB are accepted.
- New endpoints:
  - `POST /items/{id}/photo`: upload or replace a photo (home branch only; raises the item's `version` and is replicated)
  - `GET /photos/{hash}`: show a photo (with Cloudinary, it redirects the browser to Cloudinary)
  - `GET /items/mine`: the logged-in user's reports
- `GET /health` and the **Network status** page show which photo storage each branch uses.

### Web app (Next.js 16 + Tailwind CSS 4)
| Page | What it does |
|---|---|
| **Home** `/` | Search bar, live counts, recently found / lost items, branch network |
| **Browse** `/search` | Search with filters (type, category, colour, status, branch, dates) and pages |
| **Report** `/report` | Report a lost **or** found item, with drag-and-drop photo |
| **Item** `/items/{id}` | Photo and details; edit and replace the photo; staff can change the status |
| **My reports** `/my-items` | Everything you reported, at any branch |
| **Network status** `/status` | Live dashboard: each branch's heartbeat, RabbitMQ connections, events, and its copy of the data |
| **Log in / Sign up** | One account works at every branch |

The distributed system is visible in the web app:
- A **branch switcher** in the top bar shows which branches are online (green/red dot, response time).
- If your branch stops responding, a **banner offers to switch** to a branch that is up.
- An item page says whether you're looking at the **original** (home branch) or **a copy**. To edit it, the app sends you to its home branch.
- The **Network status** page shows in real time when a branch goes down, catches up, or when events wait in the outbox.

---

## Project structure

```
lostfinder/
├── docker-compose.yml          # 3 databases + 3 branches + RabbitMQ (+ optional SeaweedFS)
├── .env.example                # copy to .env to use Cloudinary for photos
├── README.md
├── docs/screenshots/           # screenshots for your report
├── scripts/
│   ├── seed_demo.py            # fills the system with demo users and items
│   └── demo_replication.py     # automatic replication demo (Phase 2)
├── backend/                    # FastAPI branch server (same code for A, B and C)
│   ├── app/
│   │   ├── main.py, config.py, database.py, models.py, schemas.py, security.py
│   │   ├── replication.py      # outbox, publisher, consumer
│   │   ├── storage.py          # photo storage: shared folder, Cloudinary or SeaweedFS
│   │   └── routers/            # health, auth, branches, items, photos, replication
│   └── tests/                  # 50 automated tests
└── frontend/                   # Next.js + Tailwind web app
    ├── package.json
    └── src/
        ├── app/                # pages: /, search, report, items/[id], my-items, status, login, register
        ├── components/         # Navbar, BranchSwitcher, ItemCard, PhotoPicker, badges…
        └── lib/                # API helper, branch list, login state, heartbeat checker
```

---

## How to run it

You need **Docker Desktop** (running) and **Node.js 20 or newer** (free, from nodejs.org).

### 1. Start the back end (branches, databases, RabbitMQ)
In the folder that contains `docker-compose.yml`:
```powershell
docker compose down -v        # only the first time after upgrading from Phase 2: starts with empty databases
docker compose up --build
```
Wait until each branch shows `consumer listening on branch-A` (and `branch-B`, `branch-C`). A few `retrying in 3s` warnings at the start are normal while RabbitMQ boots.

### 2. Start the web app (in a second terminal)
```powershell
cd frontend
npm install          # only the first time (downloads about 150 MB)
npm run dev
```
Open **http://localhost:3000**.

### 3. Add demo data (optional, in a third terminal)
```powershell
pip install httpx
python scripts/seed_demo.py
```
This creates 12 items across the three branches and two accounts: `aline@demo.rw` and `eric@demo.rw`, password `demo1234`.

### Useful addresses
| What | Address |
|---|---|
| Web app | http://localhost:3000 |
| Branch APIs | http://localhost:8001/docs, :8002/docs, :8003/docs |
| RabbitMQ dashboard | http://localhost:15672 (guest / guest) |
| Admin account (every branch) | `admin@lostfound.local` / `admin123` |

To make someone **staff** of a branch (so they can change an item's status), log in as admin at http://localhost:8001/docs and use `POST /users` with `"role": "staff", "branch_id": "A"`.

---

## Using Cloudinary (free cloud) for photos

1. Create a free account at **https://cloudinary.com/users/register_free**. No credit card is needed.
2. Open **https://console.cloudinary.com**, click the **gear icon (Settings) → API Keys**, and copy the **API environment variable**. It looks like:
   ```
   cloudinary://123456789012345:AbCdEfGhIjKlMnOpQrStUvWxYz0@your-cloud-name
   ```
3. In the folder that contains `docker-compose.yml`, copy `.env.example` to a new file named **`.env`** and paste the value after `CLOUDINARY_URL=`:
   ```
   CLOUDINARY_URL=cloudinary://123456789012345:AbCdEfGhIjKlMnOpQrStUvWxYz0@your-cloud-name
   ```
4. Restart the branches so they read it:
   ```powershell
   docker compose up -d --force-recreate branch-a branch-b branch-c
   ```
5. Check **http://localhost:3000/status**: every branch should show **Photo storage: cloudinary**.
6. Upload a photo in the web app. It appears in Cloudinary's **Media Library**, in the `lostfinder` folder.

Keep `.env` private: it contains your secret key. It is already listed in `.gitignore`, so it won't be uploaded to GitHub. To go back to the shared folder, empty the line in `.env` and run step 4 again.

## Phase 3 demo (for the presentation)

1. Open **http://localhost:3000/status** in one window. All three branches are green and "in sync".
2. In another window, log in as `aline@demo.rw` with **Campus** selected, report a **found** item and drag a photo onto the form.
3. The item page says *"original at its home branch, Campus"*. The status page shows Campus's count go up on all three cards.
4. Switch to **Bus Park** in the top bar and open the same item. It's now *"Bus Park's copy"*, the photo still shows, and **Edit** says to switch to Campus.
5. **Failure:** run `docker compose stop branch-c`. Its card turns red. Select Airport in the app: a banner offers to switch to another branch.
6. Report an item at Campus, then `docker compose start branch-c`. Airport catches up and the status page shows "in sync" again.
7. **Deduplication:** upload the same photo to two items. With Cloudinary, its *Media Library* shows one file in the `lostfinder` folder.

---

## How replication works (from Phase 2)

1. **Outbox:** a change and its event (`item.created`, `item.updated`, `item.deleted`, `user.created`) are saved in the same transaction.
2. **Publisher thread:** sends unsent events to RabbitMQ and marks them sent once RabbitMQ confirms. If RabbitMQ is down, events wait.
3. **One durable queue per branch:** every event reaches every branch, and queues keep messages for branches that are offline.
4. **Consumer thread:** applies other branches' events. New items are inserted; an item is replaced **only if the incoming `version` is higher**, so old and duplicate messages are ignored.
5. **Only the home branch changes an item** (it is the "primary", like in GFS). Other branches refuse with `409`.

---

## API summary

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/health` | anyone | Branch heartbeat |
| GET | `/branches` | anyone | Branches A, B, C |
| POST | `/auth/register` | anyone | Sign up (role is always `user`) |
| POST | `/auth/login` | anyone | JWT token (works at every branch) |
| GET | `/auth/me` | logged in | Your account |
| POST / GET | `/users` | admin | Create or list accounts (`user`, `staff` + `branch_id`, `admin`) |
| POST | `/items` | logged in | Report a LOST or FOUND item |
| GET | `/items` | anyone | Search all branches' items |
| GET | `/items/mine` | logged in | Your reports |
| GET | `/items/{id}` | anyone | One item |
| PATCH | `/items/{id}` | reporter, home-branch staff, admin | Edit (home branch only; status: staff/admin) |
| POST | `/items/{id}/photo` | reporter, home-branch staff, admin | Upload or replace the photo (home branch only) |
| DELETE | `/items/{id}` | admin | Delete (home branch only) |
| GET | `/photos/{hash}` | anyone | A photo |
| GET | `/replication/status` | anyone | Replication counters and connection state |

---

## Running without Docker
Install PostgreSQL and RabbitMQ, then:
1. Create databases `branch_a`, `branch_b`, `branch_c`.
2. Choose one photo folder for all three branches, e.g. `D:\lostfinder-photos` (or set `CLOUDINARY_URL` for Cloudinary).
3. In `backend`, run `pip install -r requirements.txt`, then start each branch in its own terminal (PowerShell example for A):
   ```powershell
   $env:BRANCH_ID="A"; $env:BRANCH_NAME="Campus"
   $env:DATABASE_URL="postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/branch_a"
   $env:RABBITMQ_URL="amqp://guest:guest@localhost:5672/"
   $env:PHOTO_DIR="D:\lostfinder-photos"     # the SAME folder for A, B and C
   uvicorn app.main:app --port 8001
   ```
   Repeat with `B` / `branch_b` / `8002` and `C` / `branch_c` / `8003`.
4. Start the web app as in step 2 above.

### Optional: SeaweedFS instead
Run `docker compose --profile seaweedfs up` and add `PHOTO_STORAGE=seaweedfs` to `.env`.

## Tests
```powershell
cd backend
python -m pytest -q        # 50 passed (no PostgreSQL, RabbitMQ or internet needed)
cd ../frontend
npm run lint               # TypeScript check
npm run build              # production build
```

## Troubleshooting
- **Web app shows every branch as offline:** the back end isn't running. Start it with `docker compose up`.
- **Branch APIs work but the web app gets errors in the browser:** open the web app at `http://localhost:3000`, not by IP address. The branches only accept that address (setting `FRONTEND_ORIGINS`).
- **Photo upload fails:** the web app shows the reason under the photo. Check what **Network status** says under *Photo storage*.
  - *"Cloudinary refused the upload: Invalid Signature"* or *"Unknown API key"*: the `CLOUDINARY_URL` in `.env` is mistyped. Copy it again from the Cloudinary console, then restart the branches (Cloudinary step 4).
  - *"Cloudinary unreachable"*: no internet. Empty `CLOUDINARY_URL` to use the shared folder instead.
  - *"Only JPEG, PNG or WebP photos are accepted"*: the file is another format (e.g. HEIC from an iPhone). Save it as JPEG first.
  - *"Photo is larger than 5 MB"*: use a smaller photo.
- **RabbitMQ: `.erlang.cookie: eacces`:** already handled by `RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS` in `docker-compose.yml`.

## Next: Phase 4
Matching between lost and found items, live notifications (WebSockets), and safe claims (one successful claim per item).
