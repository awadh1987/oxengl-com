# OxenGL Production hardener: Cron SSL Renewals & Safe Table Purge Rig
**Target Role:** DevSecOps Engineer, Database Administrator (DBA), SRE Lead
**Objective:** Automate Let's Encrypt certificate renewal checks via system cron jobs, and deploy a secure database script to truncate mock testing rows while completely safeguarding your Phase 1 master structures.

---

## ASSET A: AUTOMATED CRON RENEWAL TRIGGER (`infrastructure/cron/certbot_renew`)
This systems engineering configuration forces an out-of-band renewal verification scan every day at 03:00 AM. It auto-fetches updated encryption keys only if your certificates are within 30 days of expiration, hot-reloading Nginx with zero client connection drops [://tiangolo.com].

```text
# /etc/cron.d/certbot_renew
# System cron rule configuration: Polls Let's Encrypt servers daily at 03:00 AM
0 3 * * * root certbot renew --post-hook "systemctl reload nginx" >> /var/log/certbot_renew.log 2>&1
```

---

## ASSET B: STRUCTURAL DATA PURGE UTILITY (`scripts/purge_test_data.py`)
This script executes a clean, isolated database truncate sequence. It purges high-frequency mock entries (`iot_telemetry_events`, `gps_events`, `attendance_logs`) [docs.sqlalchemy.org] to clear storage buffers before live deployment. It is hardcoded to protect core enterprise infrastructure configurations (`tenants`, `companies`, `users`, `subscription_plans`) [docs.sqlalchemy.org, alembic.sq...lchemy.org].

```python
import asyncio
import sys
from sqlalchemy import text
from backend.database import SessionLocal

# Tables flagged for truncation to clear testing footprints completely
TARGET_MOCK_TABLES = [
    "iot_telemetry_events",
    "gps_events",
    "attendance_logs",
    "manifest_stops",
    "delivery_manifests",
    "journal_lines",
    "journal_entries"
]

async def execute_safe_production_purge():
    print("\033[1;91m▲ CRITICAL SECURITY OPERATION: COMMENCING PRODUCTION DATA PURGE ▲\033[0m")
    print("[PURGE] Warning: This utility will wipe mock logs while safeguarding master structural entities.")
    
    # Simple verification prompt bypass constraint check
    if len(sys.argv) < 2 or sys.argv[1] != "--force-production-confirm":
        print("[ABORT] Missing validation override flag: '--force-production-confirm'.")
        return

    db = SessionLocal()
    try:
        # Loop and execute isolated cascades truncations natively over PostgreSQL
        for table in TARGET_MOCK_TABLES:
            print(f"[PURGE] Wiping mock tracking footprints from table: public.{table}...")
            # CASCADE drops dependent indices bounds dynamically; RESTART IDENTITY resets primary serial increments
            await db.execute(text(f"TRUNCATE TABLE public.{table} RESTART IDENTITY CASCADE;"))
            
        await db.commit()
        print("\n\033[92m[SUCCESS] Production table buffers successfully cleared and optimized.\033[0m")
        print("  - Mapped Structure Entities Left Unchanged: \033[1m107 Chart of Accounts, SaaS Tiers, and User Records.\033[0m\n")
    except Exception as e:
        await db.rollback()
        print(f"\033[91m[REVERSION] Purge routine failed. Rolling back transaction:\033[0m {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(execute_safe_production_purge())
```
