"""Dashboard figures: /stats/overview, /me/overview and /me/matches."""
from datetime import datetime, timezone

from app.matching import explain, score
from conftest import register
from test_matching import mk, report

TODAY = datetime.now(timezone.utc).date().isoformat()  # the server counts days in UTC


def test_explain_adds_up_to_the_score():
    lost, found = mk("LOST", days_ago=1), mk("FOUND")
    assert sum(p for _, p in explain(lost, found)) == score(lost, found) == 100
    assert explain(mk("LOST", category="phone"), mk("FOUND", category="bag")) == []


def test_overview_counts_reports(client):
    u = register(client, "s1@s.rw")
    report(client, u, type="LOST", category="wallet", title="Brown wallet")
    report(client, u, type="FOUND", category="keys", title="Car keys")
    r = client.get("/stats/overview").json()
    assert r["totals"]["lost"] == 1 and r["totals"]["found"] == 1
    assert len(r["days"]) == 14 and r["days"][-1] == {"date": TODAY, "lost": 1, "found": 1}
    assert {c["category"] for c in r["by_category"]} == {"wallet", "keys"}
    assert r["by_branch"] == [{"branch": "A", "lost": 1, "found": 1}]
    assert r["totals"]["found_in_custody"] == 1 and r["last_7_days"] == 2


def test_my_overview_and_matches(client):
    owner, finder = register(client, "o@s.rw"), register(client, "f@s.rw")
    report(client, owner, type="LOST", title="Blue Samsung phone")
    report(client, finder, type="FOUND", title="Samsung phone blue", verification_question="Wallpaper?")
    me = client.get("/me/overview", headers=owner).json()
    assert me["open_lost"] == 1 and me["matches"] == 1
    matches = client.get("/me/matches", headers=owner).json()
    assert len(matches) == 1 and matches[0]["side"] == "LOST"
    assert sum(r["points"] for r in matches[0]["reasons"]) == matches[0]["score"]
    assert client.get("/me/matches", headers=finder).json()[0]["side"] == "FOUND"
    assert client.get("/me/overview").status_code == 401
