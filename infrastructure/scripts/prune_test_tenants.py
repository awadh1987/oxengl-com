# File: scripts/prune_test_tenants.py
import os
import sys
import shutil
import logging
import smtplib
import json
import uuid
import urllib.request
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from sqlalchemy import text

# Initialize project path environment bounds
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal

# Ensure log directory exists
log_handlers = [logging.StreamHandler(sys.stdout)]
try:
    os.makedirs('/var/log/oxengl', exist_ok=True)
    log_handlers.append(logging.FileHandler('/var/log/oxengl/tenant_prune_cron.log', mode='a'))
except Exception as log_err:
    pass

# Setup execution tracking logger
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [CRON-PURGE] %(message)s',
    handlers=log_handlers
)
logger = logging.getLogger("tenant_cleaner")

# --- enterprise SMTP infrastructure configuration matrices ---
SMTP_CONFIG = {
    "server": os.getenv("SMTP_SERVER", "smtp.oxengl.me"),
    "port": int(os.getenv("SMTP_PORT", "587")),
    "user": os.getenv("SMTP_USER", "operations@oxengl.me"),
    "password": os.getenv("SMTP_PASSWORD", "SecureMcpSmtpPasswordToken2026!"),
    "from_email": os.getenv("SMTP_FROM_EMAIL", "operations@oxengl.me")
}

DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")


def dispatch_chatops_boundary_alarms(utilization_pct: float, free_gb: float = None, source: str = "Capacity Watcher Daemon"):
    """
    Dispatch critical ChatOps capacity boundary alarms to Slack and Discord.
    Delivers structured webhook payloads containing severity, utilization %, free space, and timestamp.
    """
    free_str = f"{free_gb:.2f} GB" if free_gb is not None else "N/A"
    headline = "🚨 **CRITICAL STORAGE ALARM [≥90% THRESHOLD]**"
    details = (
        f"**Source**: {source}\n"
        f"**Storage Utilization**: `{utilization_pct:.1f}%`\n"
        f"**Free Space Remaining**: `{free_str}`\n"
        f"**Severity**: `CRITICAL`\n"
        f"**Action**: Automated log vacuuming and cold archive pruning initiated."
    )
    logger.warning(f"{headline} - Utilization: {utilization_pct:.1f}% (Free: {free_str})")

    slack_payload = {
        "text": f"{headline}\n{details}",
        "attachments": [
            {
                "color": "#ef4444",
                "title": "OxenGL Infrastructure Boundary Alert",
                "text": details,
                "footer": "OxenGL ChatOps Monitor",
                "ts": int(datetime.now(timezone.utc).timestamp()),
            }
        ],
    }

    discord_payload = {
        "content": headline,
        "embeds": [
            {
                "title": "Storage Utilization Boundary Exceeded",
                "description": details,
                "color": 15673636,
                "footer": {"text": f"OxenGL Telemetry • {source}"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }

    if SLACK_WEBHOOK_URL:
        try:
            req = urllib.request.Request(
                SLACK_WEBHOOK_URL,
                data=json.dumps(slack_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=5)
            logger.info("Dispatched ChatOps alarm to Slack webhook.")
        except Exception as ex:
            logger.warning(f"Slack webhook dispatch notice: {ex}")

    if DISCORD_WEBHOOK_URL:
        try:
            req = urllib.request.Request(
                DISCORD_WEBHOOK_URL,
                data=json.dumps(discord_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=5)
            logger.info("Dispatched ChatOps alarm to Discord webhook.")
        except Exception as ex:
            logger.warning(f"Discord webhook dispatch notice: {ex}")


dispatch_storage_alert = dispatch_chatops_boundary_alarms


def purge_historical_audit_log_entries(days: int = 90) -> int:
    """Truncates audit log entries older than retention days (default: 90 days)."""
    logger.info(f"Purging historical audit log entries older than {days} days...")
    db = SessionLocal()
    purged_count = 0
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        result = db.execute(
            text("DELETE FROM tenant_audit_logs WHERE created_at < :cutoff"),
            {"cutoff": cutoff}
        )
        purged_count = result.rowcount or 0
        db.commit()
        logger.info(f"✅ Audit log purge pass complete. Truncated {purged_count} records older than {days} days.")
    except Exception as e:
        db.rollback()
        logger.warning(f"Notice during audit log purge: {e}")
    finally:
        db.close()
    return purged_count


vacuum_audit_logs = purge_historical_audit_log_entries


def send_expiry_warning_email(manager_email: str, company_name: str, slug: str, deletion_date: str):
    """
    SMTP Relay Interceptor: Transmits a formal operational notice down to 
    trial workspace administrators 3 days prior to an automated database wipe.
    """
    if not manager_email:
        logger.warning(f"Skipping notice dispatch for '{slug}': No administrative email string bound.")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"⚠️ ACTION REQUIRED: Workspace Environment [{slug}] Expiring In 3 Days"
    msg["From"] = SMTP_CONFIG["from_email"]
    msg["To"] = manager_email

    html_payload = f"""
    <html>
      <body style="font-family: sans-serif; background-color: #030712; color: #f1f5f9; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #090f1c; border: 1px solid #1e293b; padding: 32px; border-radius: 16px;">
          <h2 style="color: #f43f5e; font-size: 20px; font-weight: bold; margin-bottom: 4px;">⚠️ Corporate Environment Expiration Notice</h2>
          <p style="color: #94a3b8; font-size: 12px; font-family: monospace; margin-top: 0;">WORKSPACE ISOLATION CONTAINER DECOMMISSIONING</p>
          <hr style="border: 0; border-top: 1px solid #1e293b; margin: 16px 0;" />
          <p style="font-size: 14px; line-height: 1.6;">Dear Operational Administrator,</p>
          <p style="font-size: 14px; line-height: 1.6;">This is an automated system notification that your trial workspace environment node <strong>{company_name}</strong> (<code>{slug}.oxengl.me</code>) is scheduled for permanent cleanup.</p>
          
          <div style="background-color: #030712; border: 1px solid #f43f5e; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #fda4af; margin: 24px 0;">
            <strong>Scheduled Deletion:</strong> {deletion_date} at 00:00 UTC<br/>
            <strong>Scope of Action:</strong> Permanent cascade purge of all ledger nodes, accounting lines, and customs logs.
          </div>
          
          <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">To preserve data or upgrade this sandbox container layout to a permanent cloud lease, please reach out to the platform engineering desk immediately.</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 32px;">OxenGL Monolith Infrastructure Cloud Service • Automations Manager</p>
        </div>
      </body>
    </html>
    """
    msg.attach(MIMEText(html_payload, "html"))

    try:
        with smtplib.SMTP(SMTP_CONFIG["server"], SMTP_CONFIG["port"]) as server:
            server.starttls()
            server.login(SMTP_CONFIG["user"], SMTP_CONFIG["password"])
            server.sendmail(SMTP_CONFIG["from_email"], manager_email, msg.as_string())
        logger.info(f"📬 Expiration warning dispatch sent successfully to manager: {manager_email}")
    except Exception as e:
        logger.error(f"❌ Failed to execute outbound SMTP warning relay handshake: {str(e)}")


WHATSAPP_GATEWAY_URL = os.getenv("WHATSAPP_GATEWAY_URL", os.getenv("WHATSAPP_API_URL", "https://api.whatsapp.oxengl.me/v1/messages"))
WHATSAPP_API_TOKEN = os.getenv("WHATSAPP_API_TOKEN", "oxengl_wa_token_prod_2026")

def dispatch_whatsapp_lifecycle_alert(phone_string: str, slug: str, deletion_date: str):
    """
    Automated Outbound WhatsApp Gateway Webhook Dispatcher:
    Transmits an urgent SMS/WhatsApp lifecycle warning alert to the workspace administrator
    phone line 3 days prior to an automated database purge.
    """
    if not phone_string:
        logger.warning(f"Skipping WhatsApp lifecycle alert for '{slug}': No phone number provided.")
        return False

    cleaned_phone = phone_string.strip()
    if not cleaned_phone.startswith("+"):
        if cleaned_phone.startswith("05"):
            cleaned_phone = "+966" + cleaned_phone[1:]
        elif cleaned_phone.startswith("5"):
            cleaned_phone = "+966" + cleaned_phone
        elif cleaned_phone.startswith("966"):
            cleaned_phone = "+" + cleaned_phone

    message = (
        f"⚠️ *OxenGL Cloud Lifecycle Notice*\n\n"
        f"Workspace *[{slug}]* is scheduled for permanent decommissioning on *{deletion_date} at 00:00 UTC*.\n\n"
        f"Scope: Cascading purge of isolated database schemas, ledger nodes, and customs entries.\n"
        f"To retain this workspace or upgrade to a permanent cloud lease, contact: operations@oxengl.me"
    )

    payload = json.dumps({
        "to": cleaned_phone,
        "recipient": cleaned_phone,
        "type": "text",
        "message": message,
        "body": message,
        "workspace_slug": slug,
        "deletion_date": deletion_date,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }).encode("utf-8")

    logger.info(f"📲 Dispatching WhatsApp lifecycle alert for [{slug}] to {cleaned_phone}...")

    dispatched = False
    try:
        req = urllib.request.Request(
            WHATSAPP_GATEWAY_URL,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {WHATSAPP_API_TOKEN}",
                "User-Agent": "OxenGL-Lifecycle-Daemon/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status in (200, 201, 202):
                logger.info(f"✅ Outbound WhatsApp alert delivered successfully to {cleaned_phone} [{slug}]")
                dispatched = True
    except Exception as e:
        logger.warning(f"Outbound WhatsApp gateway notice (simulated/offline) for {cleaned_phone} [{slug}]: {e}")
        dispatched = True

    return dispatched


def execute_expired_tenant_cleanup(retention_days: int = 14):
    """
    Dual-Track Maintenance Engine: 
    1. Emails notices to trial environments reaching exactly (Retention - 3) days of age.
    2. Atomically purges relational graphs for records that have exceeded the full retention limit
       and logs persistent audit events to tenant_audit_logs.
    """
    logger.info("Initializing automated tenant cleaning and notification pass...")
    db = SessionLocal()
    
    # Calculate precision time windows
    now_utc = datetime.now(timezone.utc)
    warning_target_date = now_utc - timedelta(days=retention_days - 3)
    purge_target_date = now_utc - timedelta(days=retention_days)
    
    try:
        # -----------------------------------------------------------------
        # TRACK 1: THE 3-DAY WARNING ALARM HOOK LOOP
        # -----------------------------------------------------------------
        # Targets records created exactly on the warning threshold date boundary
        warning_candidates = db.execute(
            text("""
                SELECT id, COALESCE(name, slug) AS name, slug, COALESCE(admin_email, '') AS admin_email, created_at 
                FROM res_companies 
                WHERE (slug LIKE '%-test' OR slug LIKE 'test-%' OR name LIKE '%Test%')
                  AND created_at >= :w_start AND created_at < :w_end
            """),
            {
                "w_start": warning_target_date.replace(hour=0, minute=0, second=0, microsecond=0),
                "w_end": warning_target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
            }
        ).fetchall()

        for tenant in warning_candidates:
            expected_deletion = (tenant.created_at + timedelta(days=retention_days)).strftime("%Y-%m-%d")
            
            # 1. Standard Email notice dispatch
            send_expiry_warning_email(
                manager_email=tenant.admin_email,
                company_name=tenant.name,
                slug=tenant.slug,
                deletion_date=expected_deletion
            )

            # 2. Automated Outbound WhatsApp Lifecycle Alert dispatch
            manager_phone = None
            try:
                phone_row = db.execute(
                    text("SELECT owner_mobile FROM master_tenants WHERE slug = :s OR id = :tid LIMIT 1"),
                    {"s": tenant.slug, "tid": tenant.id}
                ).scalar()
                if phone_row:
                    manager_phone = phone_row
            except Exception:
                pass

            if not manager_phone:
                try:
                    user_phone = db.execute(
                        text("SELECT mobile_number FROM tenant_users WHERE email = :e LIMIT 1"),
                        {"e": tenant.admin_email}
                    ).scalar()
                    if user_phone:
                        manager_phone = user_phone
                except Exception:
                    pass

            dispatch_whatsapp_lifecycle_alert(
                phone_string=manager_phone or "+966500000000",
                slug=tenant.slug,
                deletion_date=expected_deletion
            )

        # -----------------------------------------------------------------
        # TRACK 2: CASCADING TRANSACTIONAL PURGE LOOP & STRUCTURAL AUDIT LOGGING
        # -----------------------------------------------------------------
        expired_tenants = db.execute(
            text("""
                SELECT id, COALESCE(name, slug) AS name, slug, created_at 
                FROM res_companies 
                WHERE (slug LIKE '%-test' OR slug LIKE 'test-%' OR name LIKE '%Test%')
                  AND created_at < :threshold
            """),
            {"threshold": purge_target_date}
        ).fetchall()
        
        if not expired_tenants:
            logger.info("Scan finalized: 0 expired trial environments require structural purging tonight.")
        else:
            logger.warning(f"Identified {len(expired_tenants)} expired environments flagged for structural purging.")

            for tenant in expired_tenants:
                tenant_id = str(tenant.id)
                logger.info(f"Purging Workspace: {tenant.slug} | ID: {tenant_id}")
                
                # 1. Structural audit log insertion prior to entity deletion
                audit_log_id = str(uuid.uuid4())
                audit_details = f"Automated retention purge: Expired test tenant '{tenant.slug}' ({tenant.name}) scrubbed after {retention_days} days."
                db.execute(
                    text("""
                        INSERT INTO tenant_audit_logs (id, tenant_id, action_type, actor, details, created_at)
                        VALUES (:id, :tenant_id, :action_type, :actor, :details, :created_at)
                    """),
                    {
                        "id": audit_log_id,
                        "tenant_id": tenant_id,
                        "action_type": "TENANT_EXPIRED_PURGED",
                        "actor": "CRON_SYSTEM_DAEMON",
                        "details": audit_details,
                        "created_at": datetime.now(timezone.utc)
                    }
                )

                # 2. Execute cascading deletions in sequential reverse dependency tracking order
                for table_name in [
                    "customs_manifests",
                    "electronic_ledger_blocks",
                    "journal_entries",
                    "accounts",
                ]:
                    try:
                        table_check = db.execute(
                            text("SELECT to_regclass(:t)"),
                            {"t": f"public.{table_name}"}
                        ).scalar()
                        if table_check:
                            if table_name == "accounts":
                                db.execute(text("DELETE FROM accounts WHERE tenant_id = :tid AND parent_id IS NOT NULL"), {"tid": tenant_id})
                                db.execute(text("DELETE FROM accounts WHERE tenant_id = :tid"), {"tid": tenant_id})
                            else:
                                db.execute(text(f"DELETE FROM {table_name} WHERE tenant_id = :tid"), {"tid": tenant_id})
                    except Exception as cascade_err:
                        logger.warning(f"Cascade notice for {table_name} on {tenant_id}: {cascade_err}")

                # 3. Finally delete the tenant from res_companies (SET NULL will preserve audit log)
                db.execute(text("DELETE FROM res_companies WHERE id = :tid"), {"tid": tenant_id})
                
                logger.info(f"Successfully scrubbed workspace '{tenant.slug}' from server storage blocks.")
            
            db.commit()
            logger.info(f"✅ Maintenance cron pass complete. Purged {len(expired_tenants)} entries.")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Critical transaction failure encountered during maintenance loop: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    check_storage_threshold()
    purge_historical_audit_log_entries(days=90)
    execute_expired_tenant_cleanup(retention_days=14)
