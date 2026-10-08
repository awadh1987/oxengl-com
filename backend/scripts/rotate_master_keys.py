#!/usr/bin/env python3
"""
Master Cryptographic Key Rotation Engine for OxenGL Multi-Tenant Storage.
Filename: scripts/rotate_master_keys.py

Handles automated cryptographic key rotation by:
1. Archiving the active master AES-256 key into /var/crypto/oxengl/archive_keys/
2. Generating a fresh 256-bit AES-GCM symmetric key
3. Re-encrypting all historical and active .enc and .enc.tar.gz payloads safely via shadow files
4. Atomically swapping shadow files and updating the active master key
5. Emitting an immutable audit ledger entry in tenant_audit_logs
"""

import glob
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Ensure project root is in sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models import TenantAuditLog

KEY_FILE = "/var/crypto/oxengl/master.key"
ARCHIVE_KEY_DIR = "/var/crypto/oxengl/archive_keys"
os.makedirs(ARCHIVE_KEY_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [KEY-ROTATE] %(message)s",
)
logger = logging.getLogger("key_rotator")


def rotate_master_keys():
    """Executes safe key rotation and shadow-file re-encryption."""
    if not os.path.exists(KEY_FILE):
        logger.error(f"Master key file not found at {KEY_FILE}. Generate an initial key first.")
        return

    with open(KEY_FILE, "rb") as f:
        old_key = f.read()

    if len(old_key) != 32:
        logger.error(f"Invalid master key length ({len(old_key)} bytes). Expected 32 bytes for AES-256.")
        return

    # 1. Archive previous key with timestamp
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_key_name = f"master_{timestamp_str}.key"
    backup_key_path = os.path.join(ARCHIVE_KEY_DIR, backup_key_name)
    with open(backup_key_path, "wb") as f:
        f.write(old_key)
    try:
        os.chmod(backup_key_path, 0o600)
    except Exception:
        pass
    logger.info(f"📁 Archived previous master key to: {backup_key_path}")

    # 2. Generate fresh 256-bit AESGCM key
    new_key = AESGCM.generate_key(bit_length=256)
    old_aes = AESGCM(old_key)
    new_aes = AESGCM(new_key)

    # 3. Locate all encrypted payload targets across backup and snapshot pools
    target_patterns = [
        "/var/crypto/oxengl/backups/*.enc",
        "/var/crypto/oxengl/backups/*.enc.tar.gz",
        "/var/crypto/oxengl/snapshots/*.enc",
        "/var/crypto/oxengl/snapshots/*.enc.tar.gz",
        "/var/backups/oxengl/tenants/weekly_snapshots/*.enc",
        "/var/backups/oxengl/tenants/weekly_snapshots/*.enc.tar.gz",
    ]

    matched_files = set()
    for pattern in target_patterns:
        for fpath in glob.glob(pattern):
            if not fpath.endswith(".shadow"):
                matched_files.add(fpath)

    logger.info(f"Scanning {len(matched_files)} encrypted archive(s) for key re-encryption...")

    re_encrypted_count = 0
    failed_count = 0

    for filepath in sorted(matched_files):
        shadow_path = f"{filepath}.shadow"
        try:
            with open(filepath, "rb") as f:
                raw_stream = f.read()

            if len(raw_stream) < 28:
                # Minimum AESGCM stream: 12-byte nonce + 16-byte authentication tag
                logger.warning(f"Skipping malformed or empty encrypted stream: {filepath}")
                continue

            old_nonce = raw_stream[:12]
            ciphertext = raw_stream[12:]
            decrypted_data = old_aes.decrypt(old_nonce, ciphertext, None)

            # Re-encrypt with fresh key and fresh random nonce
            new_nonce = os.urandom(12)
            new_ciphertext = new_aes.encrypt(new_nonce, decrypted_data, None)
            new_stream = new_nonce + new_ciphertext

            # Write safely into shadow file with forced flush
            with open(shadow_path, "wb") as sf:
                sf.write(new_stream)
                sf.flush()
                os.fsync(sf.fileno())

            # Atomically swap shadow file over original
            os.replace(shadow_path, filepath)
            re_encrypted_count += 1
            logger.info(f"✅ Re-encrypted via shadow file: {filepath}")

        except Exception as e:
            if os.path.exists(shadow_path):
                try:
                    os.remove(shadow_path)
                except Exception:
                    pass
            failed_count += 1
            logger.warning(f"❌ Failed to re-encrypt {filepath}: {e}")

    # 4. Atomically commit the new master key via shadow file
    shadow_key_file = KEY_FILE + ".shadow"
    with open(shadow_key_file, "wb") as f:
        f.write(new_key)
        f.flush()
        os.fsync(f.fileno())

    try:
        os.chmod(shadow_key_file, 0o600)
    except Exception:
        pass

    os.replace(shadow_key_file, KEY_FILE)
    logger.info(f"🔑 Active master key rotated successfully: {KEY_FILE}")

    # 5. Persist audit ledger record
    db = SessionLocal()
    try:
        audit = TenantAuditLog(
            id=str(uuid.uuid4()),
            tenant_id=None,
            action_type="MASTER_KEY_ROTATED",
            actor="CRON_SYSTEM_DAEMON",
            details=(
                f"Cryptographic key rotation completed. {re_encrypted_count} archive file(s) re-keyed via shadow files. "
                f"Failures: {failed_count}. Previous master key preserved in {backup_key_name}."
            ),
            created_at=datetime.now(timezone.utc),
        )
        db.add(audit)
        db.commit()
        logger.info("📝 Audit ledger entry recorded in tenant_audit_logs.")
    except Exception as audit_err:
        logger.error(f"Failed to record audit log: {audit_err}")
    finally:
        db.close()

    logger.info(f"🎉 Master key rotation cycle finished: {re_encrypted_count} files successfully re-keyed.")


if __name__ == "__main__":
    rotate_master_keys()
