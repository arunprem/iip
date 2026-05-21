#!/usr/bin/env python3
"""
Import legacy MySQL `unit` rows into iam.offices using nested-set columns when present.

Usage:
  uv run python scripts/import_legacy_units.py
  uv run python scripts/import_legacy_units.py --replace
  uv run python scripts/import_legacy_units.py --sql infra/postgres/seed/unit_table_with_data.sql
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "services" / "iam-svc"))
sys.path.insert(0, str(ROOT / "backend" / "libs" / "iip-core"))

DEFAULT_SQL = ROOT / "infra/postgres/seed/unit_table_with_data.sql"


async def run_import(sql_path: Path, database_url: str, replace: bool) -> None:
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    from iam_svc.services.legacy_unit_import import import_legacy_units_from_sql, parse_units_sql

    sql_text = sql_path.read_text(encoding="utf-8", errors="replace")
    if not parse_units_sql(sql_text):
        raise SystemExit(f"No units parsed from {sql_path}")

    engine = create_async_engine(database_url, echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        stats = await import_legacy_units_from_sql(session, sql_path, replace=replace)
        await session.commit()
        print(stats)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import legacy unit hierarchy into iam.offices")
    parser.add_argument("--sql", type=Path, default=DEFAULT_SQL, help="Path to unit_table_with_data.sql")
    parser.add_argument(
        "--database-url",
        default="postgresql+asyncpg://iip_user:iip_secret_password@localhost:5432/iip_db",
        help="Async SQLAlchemy database URL",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing legacy imports (legacy_unit_id IS NOT NULL) before importing",
    )
    args = parser.parse_args()

    if not args.sql.is_file():
        raise SystemExit(f"SQL file not found: {args.sql}")

    asyncio.run(run_import(args.sql, args.database_url, args.replace))


if __name__ == "__main__":
    main()
