# Changelog

## 1.0.0 (Phase 6: Delivery)

**User management (admin)**
- New *User management* page: search, filter by role and status, see each person's reports and claims.
- Add users (member, staff for a branch, admin), edit name, phone, role and branch, reset passwords.
- Disable / enable accounts: a disabled account can't sign in and is signed out at every branch; its history is kept.
- Safety rules: admins can't disable themselves or drop their own admin role; there is always at least one active admin.
- *My profile*: change your own name, phone and password.
- Account changes are versioned and replicated (`user.updated` events, higher version wins). Snapshots/resync include them.
- Existing databases are upgraded automatically at start-up (new `users` columns), with no data loss.

**Delivery**
- `lostfinder` command (Windows `lostfinder.cmd`, macOS/Linux `lostfinder.sh`): start, stop, status, seed, logs, test, check, failure-test, backup, restore, reset.
- Health checks for the branches and the web app; `start` waits until everything is healthy.
- Database backup and restore.
- The web app runs in Docker (`web` service), so one command starts the whole system.
- Documentation: ARCHITECTURE, USER_GUIDE, API (generated from the code), DEMO_SCRIPT, TESTING.
- Richer demo data: 8 members, 3 staff, 38 reports with pictures, matches and claims in every state.

## 0.5.0 (Phase 5: Reliability and testing)
- Heartbeat monitor, store-and-forward queued claims, anti-entropy resync, database rebuild from peers.
- Automatic failover in the web app.
- Publisher wake-up: replication lag from 310 ms to 9 ms median.
- Failure, consistency, replication-lag and load tests.

## 0.4.0 (Phase 4: Smart features)
- Matching of lost and found items across branches, live notifications over WebSockets, safe claims with staff verification.
- Private settings in `.env`.

## 0.3.0 (Phase 3: Photos and user interface)
- Photo storage (shared folder, Cloudinary, SeaweedFS) and the Next.js + Tailwind web app.

## 0.2.0 (Phase 2: Distributed core)
- Replication through RabbitMQ with the outbox pattern; one role for members (report lost or found).

## 0.1.0 (Phase 1: Setup and foundation)
- Three FastAPI branches, each with its own PostgreSQL database, in Docker Compose; sign-up, sign-in and reports.
