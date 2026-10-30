"""Phase 2 demo: shows items and users being copied between the three branches.

Start the system first (docker compose up), then in another terminal:
    pip install httpx
    python scripts/demo_replication.py
"""
import sys
import time
import uuid
from datetime import date

import httpx

BRANCHES = {"A": "http://localhost:8001", "B": "http://localhost:8002", "C": "http://localhost:8003"}
TODAY = date.today().isoformat()


def wait_for(check, what, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if check():
                print(f"   ✔ {what}")
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    print(f"   ✘ {what} (not after {timeout}s: is RabbitMQ running?)")
    sys.exit(1)


def login(url, email, password):
    r = httpx.post(f"{url}/auth/login", data={"username": email, "password": password})
    r.raise_for_status()
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def main():
    for bid, url in BRANCHES.items():
        try:
            print(f"Branch {bid}: {httpx.get(url + '/health', timeout=3).json()['status']}")
        except httpx.HTTPError:
            print(f"Branch {bid} at {url} is not reachable. Run: docker compose up")
            sys.exit(1)

    email = f"demo-{uuid.uuid4().hex[:6]}@example.com"
    password = "secret123"
    A, B, C = BRANCHES["A"], BRANCHES["B"], BRANCHES["C"]

    print(f"\n1. Sign up {email} at Branch A (Campus)")
    httpx.post(f"{A}/auth/register", json={"full_name": "Demo User", "email": email, "password": password}).raise_for_status()
    wait_for(lambda: login(B, email, password) and login(C, email, password), "the account was copied: login works at B and C")

    print("\n2. Report a FOUND laptop at Branch B (Bus Park)")
    hb = login(B, email, password)
    item = httpx.post(f"{B}/items", headers=hb, json={
        "type": "FOUND", "category": "laptop", "colour": "black", "title": "Black HP laptop",
        "description": f"sticker on the lid ({email})", "location": "Nyabugogo", "event_date": TODAY,
    }).json()
    print(f"   item id {item['id']}, home_branch={item['home_branch']}, version={item['version']}")
    for bid in ("A", "C"):
        wait_for(lambda u=BRANCHES[bid]: httpx.get(f"{u}/items/{item['id']}").status_code == 200,
                 f"Branch {bid} has a copy")

    print("\n3. The same user reports a LOST phone at Branch A")
    ha = login(A, email, password)
    lost = httpx.post(f"{A}/items", headers=ha, json={
        "type": "LOST", "category": "phone", "title": "Blue phone", "event_date": TODAY}).json()
    wait_for(lambda: httpx.get(f"{C}/items/{lost['id']}").status_code == 200, "Branch C has a copy of the LOST item")

    print("\n4. Change the laptop at its home branch (B)")
    httpx.patch(f"{B}/items/{item['id']}", headers=hb, json={"location": "Bus Park office"}).raise_for_status()
    wait_for(lambda: httpx.get(f"{A}/items/{item['id']}").json()["version"] == 2, "Branch A now has version 2")

    print("\n5. Try to change Branch B's laptop at Branch A")
    r = httpx.patch(f"{A}/items/{item['id']}", headers=ha, json={"location": "somewhere else"})
    print(f"   ✔ refused with {r.status_code}: {r.json()['detail']}")

    print("\nReplication status:")
    for bid, url in BRANCHES.items():
        s = httpx.get(f"{url}/replication/status").json()
        print(f"   Branch {bid}: items by home branch {s['items_by_home_branch']}, "
              f"users {s['users']}, unsent events {s['outbox_pending']}")
    print("\nDone. Next, try the failure demos in the README (stop a branch, stop RabbitMQ).")


if __name__ == "__main__":
    main()
