# User guide

Open **http://localhost:3000**. The branch you are connected to is shown at the top (Campus, Bus Park or Airport). Every branch has all the reports, so it doesn't matter much which one you use. If yours goes offline, the app switches to another automatically.

There are three kinds of account:

| Role | Can |
|---|---|
| **Member** (anyone who signs up) | report lost and found items, see matches, claim items |
| **Staff** (created by an admin, for one branch) | everything a member can, plus approve or reject claims and hand items over at their branch |
| **Admin** | everything, at every branch, plus user management |

## Visitors (not signed in)

* Browse **Lost items** and **Found items**, search, and open any item.
* **Sign in** or **Register** from the top bar. A window opens over the page, and you stay on the page after signing in.

## Members

**Lost something**
1. **Report lost item** (sidebar). Describe it: category, colour, where and when. Add a photo of it or of a similar item if you have one. Keep one detail secret, such as the lock-screen picture or what is inside, to prove it's yours later.
2. The system compares your report with every found item at all three branches, now and whenever a new one arrives. When something matches, you get a notification straight away.
3. Open **My matches**. Each match shows a score and *why it matched* (same category +40, same colour +20…). If it's yours, click **This is mine: claim it**.
4. Answer the finder's question. Your claim goes to the branch holding the item. If that branch is offline, the claim waits and is sent automatically.
5. Follow it in **My claims**: *Submitted → In review → Approved → Collected*. When it's approved, bring your ID to the branch shown.

**Found something**
1. **Turn in found item**. Describe it but leave out one detail, and write a **question for the owner** that only they can answer.
2. Hand the item to the branch desk. People who lost something similar are notified.
3. **My claims → Claims on items I found** shows who claimed it and what was decided.

**Your account:** **My profile** lets you change your name, phone number and password, and choose light or dark mode. Your changes apply at every branch.

## Staff

* **Review queue**: each claim shows the finder's question next to the claimant's answer, plus the claimant's contact details. Choose **Approve** or **Reject**, and add a note (for example, how you checked).
* **Awaiting handover**: when the owner comes to the desk, check their ID, then click **Mark as handed over**. The item becomes *Returned* at every branch.
* The **dashboard** shows your queue, items in custody, recent claim activity and charts for the whole network.

## Admins

**User management** (sidebar → Administration):

| Task | How |
|---|---|
| Find someone | search by name, email or phone; filter by role or status |
| Add a staff member | **Add user** → role *Staff* → choose their branch |
| Change a role or branch | ✏️ on their row |
| Someone forgot their password | 🔑 on their row: a new password is suggested; give it to them in person |
| Block an account | ⛔ **Disable**: they can't sign in anywhere and are signed out. Their reports and claims are kept. **Enable** reverses it |

Safety rules: you can't disable yourself or remove your own admin role, and the last active admin can't be removed.

Other admin tools: **Network status** shows each branch's health, RabbitMQ connection and copy of the data. `POST /replication/resync` (in the API page `/docs`) makes every branch compare data right away.

## If something looks wrong

| You see | Meaning |
|---|---|
| A yellow banner "branch is not responding" | the app is switching to another branch; carry on |
| A claim marked **Queued** | the item's branch is offline; the claim is sent automatically when it's back |
| "This account has been disabled" | ask an admin |
| An item looks out of date at one branch | it catches up within seconds; **Network status** shows whether the branches are in sync |
