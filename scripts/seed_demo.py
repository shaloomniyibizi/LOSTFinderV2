"""Fill the system with realistic demo data across the three branches.

Start the system first (docker compose up), then:
    pip install httpx
    python scripts/seed_demo.py

It creates two demo users and about a dozen lost/found items at different branches.
Running it twice is safe: existing accounts are reused, but items are added again.
"""
import sys
from datetime import date, timedelta

import httpx

BRANCHES = {"A": "http://localhost:8001", "B": "http://localhost:8002", "C": "http://localhost:8003"}
PASSWORD = "demo1234"
USERS = [
    ("Aline Uwase", "aline@demo.rw", "+250 788 000 001"),
    ("Eric Mugisha", "eric@demo.rw", "+250 788 000 002"),
]

d = lambda days: (date.today() - timedelta(days=days)).isoformat()  # noqa: E731

# (branch, user index, item)
ITEMS = [
    ("A", 0, dict(type="FOUND", category="laptop", colour="black", title="Black HP EliteBook laptop",
                  description="Left on a desk in the library. Has a university sticker on the lid.",
                  location="Main library, 2nd floor", event_date=d(1))),
    ("A", 1, dict(type="LOST", category="id card", colour="blue", title="Student ID card",
                  description="Blue student card on a black lanyard.", location="Lecture hall LH-3", event_date=d(2))),
    ("A", 0, dict(type="FOUND", category="keys", colour="silver", title="Bunch of 3 keys with red keyring",
                  description="Found near the cafeteria entrance.", location="Campus cafeteria", event_date=d(0))),
    ("A", 1, dict(type="LOST", category="headphones", colour="white", title="White wireless earbuds",
                  description="In a small white charging case.", location="Sports ground", event_date=d(4))),
    ("B", 1, dict(type="FOUND", category="phone", colour="blue", title="Blue Samsung phone, cracked screen",
                  description="Found under a seat on the Kigali–Musanze bus.", location="Nyabugogo bus park, bay 4", event_date=d(1))),
    ("B", 0, dict(type="LOST", category="bag", colour="grey", title="Grey backpack with laptop sleeve",
                  description="Contains notebooks and a water bottle.", location="Nyabugogo bus park", event_date=d(3))),
    ("B", 1, dict(type="FOUND", category="wallet", colour="brown", title="Brown leather wallet",
                  description="No cash inside. Owner can describe the cards.", location="Ticket office", event_date=d(2))),
    ("B", 0, dict(type="LOST", category="umbrella", colour="black", title="Black folding umbrella",
                  description="", location="Bus to Huye", event_date=d(6))),
    ("C", 0, dict(type="FOUND", category="documents", colour="green", title="Green folder with documents",
                  description="Found at the check-in area.", location="Departures hall", event_date=d(1))),
    ("C", 1, dict(type="LOST", category="watch", colour="gold", title="Gold wristwatch",
                  description="Engraving on the back. Sentimental value.", location="Arrivals, baggage belt 2", event_date=d(5))),
    ("C", 0, dict(type="FOUND", category="glasses", colour="black", title="Black prescription glasses",
                  description="In a hard black case.", location="Gate 3 waiting area", event_date=d(0))),
    ("C", 1, dict(type="LOST", category="tablet", colour="silver", title="Silver iPad in a blue cover",
                  description="", location="Security check", event_date=d(2))),
]


def main():
    for bid, url in BRANCHES.items():
        try:
            httpx.get(url + "/health", timeout=3).raise_for_status()
        except httpx.HTTPError:
            print(f"Branch {bid} at {url} is not reachable. Run: docker compose up")
            sys.exit(1)

    tokens = {}
    for i, (name, email, phone) in enumerate(USERS):
        r = httpx.post(BRANCHES["A"] + "/auth/register",
                       json={"full_name": name, "email": email, "phone": phone, "password": PASSWORD})
        if r.status_code not in (201, 409):
            r.raise_for_status()
        print(("Created" if r.status_code == 201 else "Reusing") + f" user {email} / {PASSWORD}")

    import time
    for bid, user_index, item in ITEMS:
        url = BRANCHES[bid]
        key = (bid, user_index)
        if key not in tokens:
            email = USERS[user_index][1]
            for _ in range(20):  # the account may still be on its way to this branch
                r = httpx.post(url + "/auth/login", data={"username": email, "password": PASSWORD})
                if r.status_code == 200:
                    tokens[key] = r.json()["access_token"]
                    break
                time.sleep(0.5)
            else:
                print(f"Could not log in {email} at branch {bid}. Is RabbitMQ running?")
                sys.exit(1)
        r = httpx.post(url + "/items", json=item, headers={"Authorization": f"Bearer {tokens[key]}"})
        r.raise_for_status()
        print(f"  Branch {bid}: {item['type']:5} {item['title']}")

    print("\nDone. Open http://localhost:3000 and log in as aline@demo.rw or eric@demo.rw (password demo1234).")


if __name__ == "__main__":
    main()
