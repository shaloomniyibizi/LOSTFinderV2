<#
  LostFinder control script for Windows. Use it through lostfinder.cmd in the project folder:

    lostfinder start          build and start everything, wait until it is healthy, open the browser
    lostfinder stop           stop everything (your data is kept)
    lostfinder status         what is running, and each branch's health
    lostfinder seed           add the demo data (users, 38 items with pictures, claims)
    lostfinder logs [name]    follow the logs (e.g. lostfinder logs branch-a)
    lostfinder test           run the 100 automated back-end tests (in a container, no Python needed)
    lostfinder check          are the three databases identical?
    lostfinder failure-test   crash a branch, stop RabbitMQ, wipe a database, and time the recovery
    lostfinder backup         save the three databases to backups\<date>\
    lostfinder restore <dir>  put a backup back (asks first)
    lostfinder reset          delete ALL data and start from empty (asks first)
#>
param([Parameter(Position = 0)][string]$Command = "help", [Parameter(Position = 1)][string]$Arg = "")

# "Continue": in Windows PowerShell 5.1, "Stop" turns any warning that docker prints into a failure
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Branches = @{ "a" = @{ Name = "Campus"; Port = 8001 }; "b" = @{ Name = "Bus Park"; Port = 8002 }; "c" = @{ Name = "Airport"; Port = 8003 } }

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }
function Need-Docker {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { Say "Docker Desktop is not running. Start it, wait until it says 'Engine running', and try again." Red; exit 1 }
}
function Need-Env {
    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Say "Created .env from .env.example. Open it, replace every 'change-me' value, then run this again:" Yellow
        Say "    notepad .env" Yellow
        exit 1
    }
}
function Env-Value($key, $default) {
    $line = Get-Content ".env" | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
    if ($line) { return ($line -split "=", 2)[1].Trim().Trim('"').Trim("'") } else { return $default }
}
function Need-Python {
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) { Say "This command needs Python 3.10+ (https://www.python.org/downloads/, tick 'Add to PATH')." Red; exit 1 }
    python -c "import httpx, jwt" *> $null
    if ($LASTEXITCODE -ne 0) { Say "Installing the script requirements..."; python -m pip install -q -r scripts/requirements.txt }
}
function Show-Health {
    foreach ($b in "a", "b", "c") {
        $info = $Branches[$b]
        try {
            $h = Invoke-RestMethod -Uri "http://localhost:$($info.Port)/health" -TimeoutSec 3 -ErrorAction Stop
            Say ("  {0,-9} http://localhost:{1}  {2} (database {3}, photos: {4})" -f $info.Name, $info.Port, $h.status, $h.database, $h.photo_storage) Green
        } catch { Say ("  {0,-9} http://localhost:{1}  NOT RESPONDING" -f $info.Name, $info.Port) Red }
    }
    try { Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null; Say "  Web app   http://localhost:3000  ok" Green }
    catch { Say "  Web app   http://localhost:3000  NOT RESPONDING" Red }
}

switch ($Command.ToLower()) {
    "start" {
        Need-Docker; Need-Env
        Say "Building and starting LostFinder (the first time takes a few minutes)..." Cyan
        docker compose up -d --build --wait
        if ($LASTEXITCODE -ne 0) { Say "Something did not start. See: lostfinder logs" Red; exit 1 }
        Say "`nLostFinder is running:" Cyan
        Show-Health
        Say "  RabbitMQ  http://localhost:15672 (login: RABBITMQ_USER / RABBITMQ_PASSWORD from .env)"
        Say "`nNo data yet? Run: lostfinder seed" Yellow
        Start-Process "http://localhost:3000"
    }
    "stop" { Need-Docker; docker compose stop; Say "Stopped. Your data is kept; 'lostfinder start' brings it back." Cyan }
    "status" { Need-Docker; docker compose ps; Say ""; Show-Health }
    "seed" { Need-Python; python scripts/seed_demo.py }
    "logs" { Need-Docker; if ($Arg) { docker compose logs -f --tail 100 $Arg } else { docker compose logs -f --tail 50 } }
    "test" {
        Need-Docker
        Say "Running the back-end tests in a temporary container..." Cyan
        docker run --rm -v "${Root}\backend:/code" -w /code -e PYTHONDONTWRITEBYTECODE=1 python:3.12-slim `
            sh -c "pip install -q --root-user-action=ignore -r requirements.txt && python -m pytest -q -p no:cacheprovider"
    }
    "check" { Need-Python; python scripts/check_consistency.py --wait }
    "failure-test" { Need-Docker; Need-Python; python scripts/failure_test.py --include-wipe }
    "backup" {
        Need-Docker; Need-Env
        $user = Env-Value "POSTGRES_USER" "postgres"
        $dir = "backups\" + (Get-Date -Format "yyyy-MM-dd_HHmm")
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        foreach ($b in "a", "b", "c") {
            docker compose exec -T "db-$b" sh -c "pg_dump --clean --if-exists -U $user branch_$b > /tmp/backup.sql"
            docker compose cp "db-$($b):/tmp/backup.sql" "$dir\branch_$b.sql" | Out-Null
            Say ("  {0,-9} -> {1}\branch_{2}.sql" -f $Branches[$b].Name, $dir, $b) Green
        }
        Say "Backup saved in $dir" Cyan
    }
    "restore" {
        Need-Docker; Need-Env
        if (-not $Arg -or -not (Test-Path $Arg)) { Say "Usage: lostfinder restore backups\<date>" Yellow; exit 1 }
        $ok = Read-Host "This replaces the current data of the three branches with the backup in $Arg. Type YES to continue"
        if ($ok -ne "YES") { Say "Cancelled."; exit 0 }
        $user = Env-Value "POSTGRES_USER" "postgres"
        docker compose stop branch-a branch-b branch-c
        foreach ($b in "a", "b", "c") {
            docker compose cp "$Arg\branch_$b.sql" "db-$($b):/tmp/restore.sql" | Out-Null
            docker compose exec -T "db-$b" psql -q -U $user -d "branch_$b" -f /tmp/restore.sql | Out-Null
            Say "  restored $($Branches[$b].Name)" Green
        }
        docker compose start branch-a branch-b branch-c
        Say "Restored. The branches compare their copies when they start, so they agree again within seconds." Cyan
    }
    "reset" {
        Need-Docker
        $ok = Read-Host "This DELETES all reports, users, claims and photos. Type YES to continue"
        if ($ok -ne "YES") { Say "Cancelled."; exit 0 }
        docker compose down -v
        Say "All data deleted. Run 'lostfinder start' (and 'lostfinder seed' for demo data)." Cyan
    }
    default {
        Get-Content $PSCommandPath | Select-Object -Skip 1 -First 16 | ForEach-Object { Write-Host $_ }
    }
}
