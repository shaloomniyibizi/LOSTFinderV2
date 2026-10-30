"""Branch configuration.

Every branch runs the SAME code. What makes Branch A different from Branch B
is only these environment variables (set in docker-compose.yml or your shell).
"""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # Who am I? "A", "B" or "C"
    branch_id: str = os.getenv("BRANCH_ID", "A")
    branch_name: str = os.getenv("BRANCH_NAME", "Campus")

    # This branch's OWN database. A branch never connects to another branch's database.
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg://LostFinder:LostFinder_2026@localhost:5432/branch_a"
    )

    # Login tokens (JWT)
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me-0123456789abcdef")
    jwt_algorithm: str = "HS256"
    token_minutes: int = int(os.getenv("TOKEN_MINUTES", "480"))

    # RabbitMQ connection. Empty = replication switched off (e.g. when running the tests).
    rabbitmq_url: str = os.getenv("RABBITMQ_URL", "")

    # First admin account, created automatically on startup if it doesn't exist
    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@lostfound.local")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin123")


settings = Settings()

# The three branches of the system. Phase 2 uses api_url so branches can reach each other.
KNOWN_BRANCHES = [
    {"id": "A", "name": "Campus", "api_url": "http://localhost:8001"},
    {"id": "B", "name": "Bus Park", "api_url": "http://localhost:8002"},
    {"id": "C", "name": "Airport", "api_url": "http://localhost:8003"},
]
