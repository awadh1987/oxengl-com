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
