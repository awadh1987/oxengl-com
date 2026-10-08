import os
import sys
from pathlib import Path

# Add backend and project root to sys.path
root_dir = Path(__file__).resolve().parents[2]
backend_dir = root_dir / "backend"
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(backend_dir))

import uuid
from datetime import datetime, timezone
from sqlalchemy import text
from backend.database import engine
from backend.two_tier_auth import hash_password, verify_password

SUPERADMIN_EMAIL = "admin@oxengl.me"
SUPERADMIN_PASSWORD = "OxenGL@2026Secure!"
SUPERADMIN_PHONE = "+966500000000"
SUPERADMIN_NAME = "OxenGL Platform Super Administrator"


def provision_super_admin():
    print(f"[PROVISION] Hashing credentials with Argon2id for {SUPERADMIN_EMAIL}...")
    argon2_hash = hash_password(SUPERADMIN_PASSWORD)
    assert verify_password(SUPERADMIN_PASSWORD, argon2_hash), "Argon2id self-test verification failed!"
    print(f"[PROVISION] Argon2id hash generated: {argon2_hash[:30]}...")

    with engine.begin() as conn:
        # 1. Ensure table schema columns exist
        conn.execute(text("ALTER TABLE master_users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT TRUE;"))
        conn.execute(text("ALTER TABLE res_users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT TRUE;"))

        # 2. Upsert in master_users (Master Control Plane Level 1)
        existing_master = conn.execute(
            text("SELECT id FROM master_users WHERE LOWER(email) = :email"),
            {"email": SUPERADMIN_EMAIL.lower()},
        ).scalar()

        if existing_master:
            conn.execute(
                text("""
                    UPDATE master_users
                    SET password_hash = :hash,
                        role = 'super_admin',
                        is_active = TRUE,
                        is_superuser = TRUE,
                        failed_login_attempts = 0,
                        locked_until = NULL,
                        tfa_enabled = FALSE,
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {"hash": argon2_hash, "id": existing_master},
            )
            print(f"[PROVISION] Updated existing master_users record: {existing_master}")
        else:
            new_id = uuid.uuid4()
            conn.execute(
                text("""
                    INSERT INTO master_users (
                        id, email, mobile_number, full_name, password_hash,
                        role, is_active, is_superuser, failed_login_attempts,
                        locked_until, tfa_enabled, created_at, updated_at
                    ) VALUES (
                        :id, :email, :phone, :name,
                        :hash, 'super_admin', TRUE, TRUE, 0, NULL, FALSE, NOW(), NOW()
                    )
                """),
                {
                    "id": new_id,
                    "email": SUPERADMIN_EMAIL.lower(),
                    "phone": SUPERADMIN_PHONE,
                    "name": SUPERADMIN_NAME,
                    "hash": argon2_hash,
                },
            )
            print(f"[PROVISION] Inserted new master_users record: {new_id}")

        # 3. Upsert in res_users (Level 2 Enterprise / ResUser model)
        existing_res = conn.execute(
            text("SELECT id FROM res_users WHERE LOWER(email) = :email"),
            {"email": SUPERADMIN_EMAIL.lower()},
        ).scalar()

        if existing_res:
            conn.execute(
                text("""
                    UPDATE res_users
                    SET password_hash = :hash,
                        role = 'Super_Admin',
                        is_active = TRUE,
                        is_superuser = TRUE,
                        mfa_enabled = FALSE,
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {"hash": argon2_hash, "id": existing_res},
            )
            print(f"[PROVISION] Updated existing res_users record: {existing_res}")
        else:
            new_res_id = uuid.uuid4()
            conn.execute(
                text("""
                    INSERT INTO res_users (
                        id, firebase_uid, email, full_name, phone, password_hash,
                        role, is_active, is_superuser, mfa_enabled, created_at, updated_at
                    ) VALUES (
                        :id, :firebase_uid, :email, :name,
                        :phone, :hash, 'Super_Admin', TRUE, TRUE, FALSE, NOW(), NOW()
                    )
                """),
                {
                    "id": new_res_id,
                    "firebase_uid": f"native:{SUPERADMIN_EMAIL.lower()}",
                    "email": SUPERADMIN_EMAIL.lower(),
                    "name": SUPERADMIN_NAME,
                    "phone": SUPERADMIN_PHONE,
                    "hash": argon2_hash,
                },
            )
            print(f"[PROVISION] Inserted new res_users record: {new_res_id}")

        # 4. Upsert admin@oxengl.com for full compatibility
        legacy_id = uuid.UUID("00000000-0000-0000-0000-000000000000")
        conn.execute(
            text("""
                INSERT INTO master_users (
                    id, email, mobile_number, full_name, password_hash,
                    role, is_active, is_superuser, failed_login_attempts,
                    locked_until, tfa_enabled, created_at, updated_at
                ) VALUES (
                    :id, 'admin@oxengl.com', '+966500000002', 'OxenGL Administrator',
                    :hash, 'super_admin', TRUE, TRUE, 0, NULL, FALSE, NOW(), NOW()
                )
                ON CONFLICT (email) DO UPDATE
                SET password_hash = :hash,
                    mobile_number = '+966500000002',
                    role = 'super_admin',
                    is_active = TRUE,
                    is_superuser = TRUE,
                    failed_login_attempts = 0,
                    locked_until = NULL,
                    updated_at = NOW();
            """),
            {"id": legacy_id, "hash": argon2_hash},
        )
        print("[PROVISION] Synchronized admin@oxengl.com credentials.")

        # 5. Synchronize superadmin@oxengl.com as secondary superadmin
        conn.execute(
            text("""
                UPDATE master_users
                SET password_hash = :hash,
                    is_active = TRUE,
                    is_superuser = TRUE,
                    failed_login_attempts = 0,
                    locked_until = NULL,
                    updated_at = NOW()
                WHERE email = 'superadmin@oxengl.com'
            """),
            {"hash": argon2_hash},
        )
        print("[PROVISION] Synchronized superadmin@oxengl.com credentials.")

        # 6. Create or replace public.users view for compatibility
        conn.execute(
            text("CREATE OR REPLACE VIEW public.users AS SELECT * FROM public.res_users;")
        )
        print("[PROVISION] Ensured public.users compatibility view.")

    print(f"[PROVISION SUCCESS] Super-admin {SUPERADMIN_EMAIL} successfully configured!")


if __name__ == "__main__":
    provision_super_admin()
