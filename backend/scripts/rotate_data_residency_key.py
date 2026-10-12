#!/usr/bin/env python3
"""
One-off / repeatable rotation of the data-residency Fernet key.
File: backend/scripts/rotate_data_residency_key.py

Scans EVERY text/varchar column in all non-system schemas for Fernet tokens ("gAAAAA..."),
decrypts each with the OLD key, re-encrypts with the NEW key, verifies the round-trip, and
updates the row -- all inside ONE transaction (any failure rolls back everything).
Never prints plaintext.

Keys are derived exactly like backend/database.py: Fernet(urlsafe_b64encode(sha256(raw_key))).

Usage (inside the backend container / with DATABASE_URL set):
    # dry run (default): report what would change
    OLD_DATA_RESIDENCY_KEY=... DATA_RESIDENCY_KEY=... python -m backend.scripts.rotate_data_residency_key
    # migrate away from the former hard-coded default key
    DATA_RESIDENCY_KEY=... python -m backend.scripts.rotate_data_residency_key --from-legacy-default --apply \
        --backup-file /tmp/residency_backup.json
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import create_engine, text

# The former public fallback in backend/database.py (removed). Only used with --from-legacy-default.
LEGACY_DEFAULT_KEY = "oxengl-data-residency-secret-key-32b-default"
SYSTEM_SCHEMAS = ("pg_catalog", "information_schema", "pg_toast")


def fernet_for(raw_key: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw_key.encode("utf-8")).digest()))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="commit changes (default: dry run)")
    ap.add_argument("--from-legacy-default", action="store_true", help="old key = former hard-coded default")
    ap.add_argument("--backup-file", help="write original ciphertexts (JSON, chmod 600) before updating")
    args = ap.parse_args()

    old_raw = LEGACY_DEFAULT_KEY if args.from_legacy_default else os.getenv("OLD_DATA_RESIDENCY_KEY", "")
    new_raw = os.getenv("DATA_RESIDENCY_KEY", "")
    db_url = os.getenv("DATABASE_URL", "")
    if not old_raw or not new_raw or not db_url:
        print("ERROR: need old key (OLD_DATA_RESIDENCY_KEY or --from-legacy-default), DATA_RESIDENCY_KEY and DATABASE_URL")
        return 2
    if len(new_raw) < 32 or new_raw == LEGACY_DEFAULT_KEY or new_raw == old_raw:
        print("ERROR: new key must be >= 32 chars and differ from the old/legacy key")
        return 2
    old_f, new_f = fernet_for(old_raw), fernet_for(new_raw)

    engine = create_engine(db_url.replace("+asyncpg", "+psycopg2"))
    stats = {"scanned_columns": 0, "tokens": 0, "rotated": 0, "already_new": 0, "undecryptable": 0}
    backup: list[dict] = []
    with engine.connect() as conn:
      trans = conn.begin()  # single transaction for everything
      try:
        cols = conn.execute(text(
            "SELECT table_schema, table_name, column_name FROM information_schema.columns "
            "JOIN information_schema.tables USING (table_schema, table_name) "
            "WHERE table_type = 'BASE TABLE' AND data_type IN ('text', 'character varying') "
            "AND table_schema <> ALL(:sys)"
        ), {"sys": list(SYSTEM_SCHEMAS)}).all()
        for schema, table, column in cols:
            stats["scanned_columns"] += 1
            fq = f'"{schema}"."{table}"'
            rows = conn.execute(text(
                f'SELECT ctid::text AS ctid, "{column}" AS v FROM {fq} WHERE "{column}" LIKE \'gAAAAA%\''
            )).all()
            for ctid, value in rows:
                stats["tokens"] += 1
                try:
                    plain = old_f.decrypt(value.encode("utf-8"))
                except InvalidToken:
                    try:
                        new_f.decrypt(value.encode("utf-8"))
                        stats["already_new"] += 1
                    except InvalidToken:
                        stats["undecryptable"] += 1
                        print(f"WARN: {schema}.{table}.{column} ctid={ctid}: not decryptable with old or new key (left unchanged)")
                    continue
                new_token = new_f.encrypt(plain).decode("utf-8")
                assert new_f.decrypt(new_token.encode("utf-8")) == plain, "round-trip verification failed"
                backup.append({"table": f"{schema}.{table}", "column": column, "ctid": ctid, "old_token": value})
                if args.apply:
                    res = conn.execute(text(
                        f'UPDATE {fq} SET "{column}" = :new WHERE ctid = CAST(:ctid AS tid) AND "{column}" = :old'
                    ), {"new": new_token, "ctid": ctid, "old": value})
                    if res.rowcount != 1:
                        raise RuntimeError(f"update affected {res.rowcount} rows for {schema}.{table}.{column}; rolling back")
                stats["rotated"] += 1
                print(f"{'ROTATED' if args.apply else 'WOULD ROTATE'}: {schema}.{table}.{column}")
        if args.backup_file and backup:
            fd = os.open(args.backup_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as fh:
                json.dump(backup, fh)
        if args.apply:
            trans.commit()
        else:
            trans.rollback()
      except Exception:
        trans.rollback()
        raise
    print(json.dumps({**stats, "mode": "APPLIED" if args.apply else "DRY-RUN"}))
    return 1 if stats["undecryptable"] else 0


if __name__ == "__main__":
    sys.exit(main())
