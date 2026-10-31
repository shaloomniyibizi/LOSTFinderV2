# Presentation demo (about 12 minutes)

A step-by-step run-through for the final presentation. It shows the distributed features (replication, matching across branches, safe claims, fault tolerance) and the admin side.

## Before the presentation

```powershell
lostfinder reset          # optional: start from empty
lostfinder start          # waits until everything is healthy, opens the browser
lostfinder seed           # demo users, 38 items with pictures, claims
lostfinder status         # all green?
```
Open these windows:
1. **Browser 1** (normal window): http://localhost:3000, signed in as `aline@demo.rw` / `demo1234`, branch **Campus**.
2. **Browser 2** (private window): http://localhost:3000, signed in as `ange@staff.rw` / `demo1234` (Airport staff), branch **Airport**.
3. A **terminal** in the project folder.
4. *(optional)* RabbitMQ dashboard http://localhost:15672 → *Queues*.

## 1. The system at a glance (1 min)

* Browser 2: the **staff dashboard**, with claims to review, items in custody, the 14-day chart and reports by home branch.
* Sidebar → **Network status**: three branches, each with its own database; every branch holds the same number of items from every home branch (*in sync*).

> Each branch is a separate server with its own PostgreSQL database. They share data only through events.

## 2. Replication in real time (2 min)

* Browser 1 (Campus): **Report lost item**: *"Red Tecno phone with a cracked screen"*, category Phone, colour Red, today.
* Browser 2 (Airport): **Lost items**: the report is already there, marked *Campus* as its home branch.
* Terminal: `lostfinder check` → *CONSISTENT*.

> The report and its event were saved in one transaction (outbox pattern). RabbitMQ delivered it to Bus Park and Airport in about 10 ms.

## 3. Matching across branches + live notification (2 min)

* Browser 2 (Airport staff): **Turn in found item**: *"Red Tecno phone, cracked screen"*, Phone, Red, question *"What is the wallpaper?"*.
* Browser 1 gets a **pop-up**: *Possible match*. Open **My matches** and show the score and *why it matched*.

> Matching ran independently at every branch. The match id is derived from the two item ids, so all branches agree without coordinating.

## 4. Safe claims (2 min)

* Browser 1: **This is mine: claim it**, then answer *"A photo of Lake Kivu"*. The claim is forwarded to **Airport**, the item's home branch.
* Browser 2: **Review queue** → **Approve**. Browser 1 receives *Claim approved*; **My claims** shows the progress steps.
* Terminal: `python scripts/demo_claims.py`. Two people claim the same item at the same instant from two branches, and exactly one wins.

> Only the home branch decides, and it locks the item row while it does, so an item can't be given to two people.

## 5. Fault tolerance (3 min)

* Terminal: `docker compose stop branch-c` (Airport).
* **Network status**: within about 15 s, Campus and Bus Park show Airport as **down**.
* Browser 2 was using Airport: it switches to another branch by itself (pop-up).
* Browser 1: claim an Airport item (e.g. *White iPhone 13*): **Claim queued**.
* Report something at Campus while Airport is down.
* `docker compose start branch-c`: within seconds the queued claim is delivered (notification), and Airport catches up on the report it missed. Network status shows *in sync*.

> Heartbeats detect the failure, store-and-forward keeps the claim safe, and durable queues plus resync bring the branch back up to date.

Optional, if there is time: `lostfinder failure-test` runs all failure scenarios automatically and writes a timed report (16 checks).

## 6. Administration (1 min)

* Sign in as the admin (from `.env`) → **User management**.
* Disable `patrick@demo.rw`. In another window, signing in as Patrick fails: *"This account has been disabled"*.
* Enable him again. Reset a password and show the suggested one.

> Account changes carry a version number and replicate like everything else, so they take effect at every branch.

## 7. Wrap-up (1 min)

Show [TESTING.md](TESTING.md): 100 automated tests, 16/16 failure checks, replication lag ~9 ms median, load test with 3 branches vs 1.

## If something goes wrong during the demo

| Problem | Fix |
|---|---|
| A page shows an error after a restart | wait 10 s (the branch is starting) or switch branch at the top |
| No pop-up | the bell icon is crossed out while reconnecting; refresh the page |
| Data looks out of sync | `lostfinder check`, or `POST /replication/resync` as admin |
| Everything is broken | `lostfinder stop` → `lostfinder start` (data is kept) |
