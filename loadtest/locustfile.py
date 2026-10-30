"""Load test with Locust (free, open source).

    pip install locust
    # 3 branches: virtual users are spread over Campus, Bus Park and Airport
    locust -f loadtest/locustfile.py --headless -u 60 -r 10 -t 1m --csv docs/results/load_3_branches
    # 1 branch: everyone uses Campus only
    LOCUST_BRANCHES=http://localhost:8001 locust -f loadtest/locustfile.py --headless -u 60 -r 10 -t 1m --csv docs/results/load_1_branch
    (Windows PowerShell:  $env:LOCUST_BRANCHES="http://localhost:8001"; locust ...)

Or run `locust -f loadtest/locustfile.py` and open http://localhost:8089 for live charts.

Each virtual user signs up at one branch and then behaves like a real visitor:
mostly searching and opening items, sometimes reporting an item.
"""
import os
import random
import uuid
from datetime import date

from locust import HttpUser, between, task

BRANCH_URLS = [u.strip() for u in os.getenv(
    "LOCUST_BRANCHES", "http://localhost:8001,http://localhost:8002,http://localhost:8003").split(",") if u.strip()]
WORDS = ["phone", "laptop", "black", "blue", "bag", "keys", "wallet", "card", "umbrella", "watch"]
CATEGORIES = ["phone", "laptop", "bag", "keys", "wallet", "id card", "umbrella", "watch", "other"]


class Visitor(HttpUser):
    wait_time = between(0.5, 2)
    host = BRANCH_URLS[0]

    def on_start(self):
        self.host = random.choice(BRANCH_URLS)  # this visitor uses one branch
        self.client.base_url = self.host
        self.item_ids: list[str] = []
        email = f"load-{uuid.uuid4().hex[:10]}@test.rw"
        self.client.post("/auth/register", json={"full_name": "Load Tester", "email": email, "password": "load-pass-123"},
                         name="/auth/register")
        r = self.client.post("/auth/login", data={"username": email, "password": "load-pass-123"}, name="/auth/login")
        self.headers = {"Authorization": "Bearer " + r.json()["access_token"]} if r.status_code == 200 else {}

    @task(6)
    def search(self):
        r = self.client.get("/items", params={"q": random.choice(WORDS), "limit": 12}, name="/items?q=")
        if r.status_code == 200:
            self.item_ids = [i["id"] for i in r.json()["items"]][:20] or self.item_ids

    @task(3)
    def view_item(self):
        if self.item_ids:
            self.client.get(f"/items/{random.choice(self.item_ids)}", name="/items/{id}")

    @task(1)
    def report_item(self):
        if not self.headers:
            return
        self.client.post("/items", headers=self.headers, name="POST /items", json={
            "type": random.choice(["LOST", "FOUND"]), "category": random.choice(CATEGORIES),
            "colour": random.choice(["black", "blue", "red", None]),
            "title": f"{random.choice(WORDS).title()} {random.choice(WORDS)} (load test)",
            "event_date": date.today().isoformat()})
