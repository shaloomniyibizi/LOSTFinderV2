"""Phase 4 demo: two people claim the SAME item at the SAME moment from DIFFERENT branches.

Start the system first (docker compose up), then:
    pip install httpx
    python scripts/demo_claims.py

What you should see: exactly one claim is accepted, the other is refused.
Both requests are forwarded to the item's home branch (Bus Park), which locks the item's
database row (SELECT ... FOR UPDATE) so only the first one can change it.
"""
import sys
import threading
import time
import uuid
from datetime import date

import httpx

A, B, C = "http://localhost:8001", "http://localhost:8002", "http://localhost:8003"
NAMES = {A: "Campus", B: "Bus Park", C: "Airport"}
PASSWORD = "demo1234"
run = uuid.uuid4().hex[:5]


def wait(fn, what, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn():
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.4)
    print(f"Timed out waiting for: {what}. Is RabbitMQ running?")
    sys.exit(1)


def signup(url, name):
    email = f"{name.lower()}-{run}@demo.rw"
    httpx.post(url + "/auth/register", json={"full_name": name, "email": email, "password": PASSWORD}).raise_for_status()
    return email


def token(url, email):
    r = httpx.post(url + "/auth/login", data={"username": email, "password": PASSWORD})
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    for url in (A, B, C):
        try:
            httpx.get(url + "/health", timeout=3).raise_for_status()
        except httpx.HTTPError:
            print(f"{NAMES[url]} ({url}) is not reachable. Run: docker compose up")
            sys.exit(1)

    finder = signup(B, "Finder")
    alice = signup(A, "Alice")
    bob = signup(C, "Bob")
    wait(lambda: token(A, alice) and token(C, bob) and token(B, alice) and token(B, bob), "accounts to reach all branches")

    item = httpx.post(B + "/items", headers={"Authorization": "Bearer " + token(B, finder)}, json={
        "type": "FOUND", "category": "phone", "colour": "black", "title": f"Black iPhone (demo {run})",
        "event_date": date.today().isoformat(), "verification_question": "What is the lock-screen picture?",
    }).json()
    print(f"\nFinder reported a FOUND phone at Bus Park (home branch B): {item['title']}")
    wait(lambda: httpx.get(f"{A}/items/{item['id']}").status_code == 200 and
         httpx.get(f"{C}/items/{item['id']}").status_code == 200, "the item to reach Campus and Airport")

    tokens = {"Alice (using Campus)": (A, token(A, alice)), "Bob (using Airport)": (C, token(C, bob))}
    results = {}
    start = threading.Barrier(len(tokens))

    def claim(who, url, tok):
        start.wait()  # both requests leave at the same instant
        t0 = time.perf_counter()
        r = httpx.post(f"{url}/items/{item['id']}/claims", headers={"Authorization": "Bearer " + tok},
                       json={"answer": f"{who.split()[0]}'s answer"}, timeout=15)
        results[who] = (r.status_code, r.json(), round((time.perf_counter() - t0) * 1000))

    print("Alice (at Campus) and Bob (at Airport) click 'Claim' at the same moment...\n")
    threads = [threading.Thread(target=claim, args=(who, url, tok)) for who, (url, tok) in tokens.items()]
    [t.start() for t in threads]
    [t.join() for t in threads]

    for who, (code, body, ms) in results.items():
        verdict = "ACCEPTED" if code == 201 else "REFUSED "
        detail = f"claim saved at {body['home_branch']}" if code == 201 else body.get("detail")
        print(f"  {verdict} HTTP {code} · {ms:4} ms · {who}: {detail}")

    accepted = sum(1 for code, _, _ in results.values() if code == 201)
    print("\nResult:", "exactly ONE claim succeeded ✔" if accepted == 1 else f"{accepted} claims succeeded ✘")
    time.sleep(1.5)  # give the change a moment to reach every branch
    states = {NAMES[u]: httpx.get(f"{u}/items/{item['id']}").json()["status"] for u in (A, B, C)}
    print("Item status on each branch:", states)


if __name__ == "__main__":
    main()
