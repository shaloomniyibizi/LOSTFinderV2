#!/usr/bin/env bash
# LostFinder control script for macOS and Linux (Windows: use lostfinder.cmd).
#
#   ./lostfinder.sh start          build and start everything, wait until it is healthy
#   ./lostfinder.sh stop           stop everything (your data is kept)
#   ./lostfinder.sh status         what is running, and each branch's health
#   ./lostfinder.sh seed           add the demo data (users, 38 items with pictures, claims)
#   ./lostfinder.sh logs [name]    follow the logs (e.g. ./lostfinder.sh logs branch-a)
#   ./lostfinder.sh test           run the back-end tests (in a container, no Python needed)
#   ./lostfinder.sh check          are the three databases identical?
#   ./lostfinder.sh failure-test   crash a branch, stop RabbitMQ, wipe a database, time the recovery
#   ./lostfinder.sh backup         save the three databases to backups/<date>/
#   ./lostfinder.sh restore <dir>  put a backup back (asks first)
#   ./lostfinder.sh reset          delete ALL data and start from empty (asks first)
set -euo pipefail
cd "$(dirname "$0")"
cmd="${1:-help}"; arg="${2:-}"
names=(Campus "Bus Park" Airport); ports=(8001 8002 8003)

need_docker() { docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop and try again."; exit 1; }; }
need_env() {
  if [ ! -f .env ]; then cp .env.example .env
    echo "Created .env from .env.example. Edit it (replace every 'change-me'), then run this again."; exit 1; fi
}
env_value() { grep -E "^\s*$1\s*=" .env | head -1 | cut -d= -f2- | tr -d '"'"'" | xargs || true; }
need_python() {
  command -v python3 >/dev/null || { echo "This command needs Python 3.10+."; exit 1; }
  python3 -c "import httpx, jwt" 2>/dev/null || python3 -m pip install -q -r scripts/requirements.txt
}
health() {
  for i in 0 1 2; do
    if out=$(curl -fsS -m 3 "http://localhost:${ports[$i]}/health" 2>/dev/null); then
      printf "  %-9s http://localhost:%s  %s\n" "${names[$i]}" "${ports[$i]}" "$(echo "$out" | sed -E 's/.*"status":"([a-z]+)".*/\1/')"
    else printf "  %-9s http://localhost:%s  NOT RESPONDING\n" "${names[$i]}" "${ports[$i]}"; fi
  done
  curl -fsS -m 5 -o /dev/null http://localhost:3000 && echo "  Web app   http://localhost:3000  ok" || echo "  Web app   http://localhost:3000  NOT RESPONDING"
}

case "$cmd" in
  start)
    need_docker; need_env
    echo "Building and starting LostFinder (the first time takes a few minutes)..."
    docker compose up -d --build --wait
    echo; echo "LostFinder is running:"; health
    echo "  RabbitMQ  http://localhost:15672"; echo; echo "No data yet? Run: ./lostfinder.sh seed"
    (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || true ;;
  stop) need_docker; docker compose stop; echo "Stopped. Your data is kept." ;;
  status) need_docker; docker compose ps; echo; health ;;
  seed) need_python; python3 scripts/seed_demo.py ;;
  logs) need_docker; if [ -n "$arg" ]; then docker compose logs -f --tail 100 "$arg"; else docker compose logs -f --tail 50; fi ;;
  test)
    need_docker
    docker run --rm -v "$PWD/backend:/code" -w /code -e PYTHONDONTWRITEBYTECODE=1 python:3.12-slim \
      sh -c "pip install -q --root-user-action=ignore -r requirements.txt && python -m pytest -q -p no:cacheprovider" ;;
  check) need_python; python3 scripts/check_consistency.py --wait ;;
  failure-test) need_docker; need_python; python3 scripts/failure_test.py --include-wipe ;;
  backup)
    need_docker; need_env; user=$(env_value POSTGRES_USER); user=${user:-postgres}
    dir="backups/$(date +%Y-%m-%d_%H%M)"; mkdir -p "$dir"
    for b in a b c; do
      docker compose exec -T "db-$b" sh -c "pg_dump --clean --if-exists -U $user branch_$b > /tmp/backup.sql"
      docker compose cp "db-$b:/tmp/backup.sql" "$dir/branch_$b.sql" >/dev/null; echo "  saved $dir/branch_$b.sql"
    done; echo "Backup saved in $dir" ;;
  restore)
    need_docker; need_env
    [ -n "$arg" ] && [ -d "$arg" ] || { echo "Usage: ./lostfinder.sh restore backups/<date>"; exit 1; }
    read -r -p "This replaces the data of the three branches with the backup in $arg. Type YES to continue: " ok
    [ "$ok" = "YES" ] || { echo "Cancelled."; exit 0; }
    user=$(env_value POSTGRES_USER); user=${user:-postgres}
    docker compose stop branch-a branch-b branch-c
    for b in a b c; do
      docker compose cp "$arg/branch_$b.sql" "db-$b:/tmp/restore.sql" >/dev/null
      docker compose exec -T "db-$b" psql -q -U "$user" -d "branch_$b" -f /tmp/restore.sql >/dev/null; echo "  restored branch $b"
    done
    docker compose start branch-a branch-b branch-c; echo "Restored. The branches resync with each other when they start." ;;
  reset)
    need_docker
    read -r -p "This DELETES all reports, users, claims and photos. Type YES to continue: " ok
    [ "$ok" = "YES" ] || { echo "Cancelled."; exit 0; }
    docker compose down -v; echo "All data deleted. Run './lostfinder.sh start' (and 'seed' for demo data)." ;;
  *) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
