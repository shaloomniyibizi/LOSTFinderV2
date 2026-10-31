"""Database connection (SQLAlchemy). Each branch connects only to its own database."""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: one database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after Phase 5. create_all() makes new tables but never changes existing ones, so a
# database created by an earlier phase gets the missing columns here (no data is lost).
_NEW_COLUMNS = {
    "users": [
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("version", "INTEGER NOT NULL DEFAULT 1"),
        ("updated_at", "TIMESTAMP WITH TIME ZONE"),
    ],
}


def upgrade_schema() -> list[str]:
    added = []
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, columns in _NEW_COLUMNS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in columns:
                if name not in existing:
                    if engine.dialect.name == "sqlite":
                        ddl = ddl.replace("TIMESTAMP WITH TIME ZONE", "TIMESTAMP").replace("TRUE", "1")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    added.append(f"{table}.{name}")
    return added
