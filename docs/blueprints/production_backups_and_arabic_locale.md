# OxenGL Production Blueprint: Automated Backups Rig & Phase 4 Arabic Localization Profile
**Objective:** Deploy an automated database backup utility script utilizing system cron frameworks, and engineer a strict, comprehensive Arabic JSON localization schema for bilingual multi-tenant operations.

---

## ASSET A: AUTOMATED DB SNAPSHOT RUNNER (`scripts/backup_db.sh`)
This shell utility executes high-speed, compressed, transaction-safe backups natively out of your live PostgreSQL instance. It flushes local snapshot artifacts into rotated folders and contains hooks to pipe the `.sql.gz` targets to secure remote cloud buckets (AWS S3, Wasabi, or an isolated backup vault) [docs.sqlalchemy.org, alembic.sq...lchemy.org].

```bash
#!/usr/bin/env bash
# ====================================================================
# OxenGL Production Database Automated Snapshot Utility
# Purpose: Executes non-blocking compressed backups and rotates assets.
# ====================================================================
set -eo pipefail

BACKUP_DIR="/var/backups/oxengl/postgres"
TIMESTAMP=\$(date +"%Y%m%d_%H%M%S")
TARGET_FILE="\({BACKUP_DIR}/erp_db_\){TIMESTAMP}.sql.gz"
CONTAINER_NAME="oxengl_postgres_container"
RETENTION_DAYS=7

echo -e "\033[1m[BACKUP-INFO]\033[0m Commencing compressed database snapshot allocation loop..."
mkdir -p "\${BACKUP_DIR}"

# 1. Execute safe, transaction-isolated pg_dump stream over the live container node
docker exec -t "\({CONTAINER_NAME}" pg_dump -U postgres -d erp_db \vert{} gzip > "\){TARGET_FILE}"

# 2. Restrict file permissions immediately to protect enterprise state secrets
chmod 0600 "\${TARGET_FILE}"
echo -e "\033[92m[SUCCESS]\033[0m Local compressed backup archive generated at: \${TARGET_FILE}"

# 3. Optional Cloud Mirroring Hook Block
# aws s3 cp "\${TARGET_FILE}" "s3://my-secure-oxengl-vault-bucket/db/" --quiet

# 4. Prune historical backup instances older than the explicit retention threshold
echo -e "[BACKUP-INFO] Scanning for historical artifacts older than \${RETENTION_DAYS} days..."
find "\({BACKUP_DIR}" -type f -name "erp_db_*.sql.gz" -mtime +"\){RETENTION_DAYS}" -exec rm -f {} \;
echo -e "\033[92m[SUCCESS]\033[0m Historical snapshot compaction cycle complete."
```

---

## ASSET B: PHASE 4 ARABIC LOCALIZATION SCHEMA (`frontend/src/locales/ar.json`)
This strict translation registry maps every core semantic token inside the Phase 1 through Phase 4 layout boundaries, ensuring a fluid translation experience across analytics graphs and telemetry map panels.

```json
{
  "global": {
    "platform_name": "أوكسين جي إل لإدارة العمليات اللوجستية",
    "status_operational": "جاهز للعمل",
    "status_critical": "تحذير حرج",
    "loading": "جاري التحميل... تحليل البيانات"
  },
  "security": {
    "mfa_header": "التحقق من الهوية ثنائي العوامل",
    "mfa_subheader": "أدخل الرمز المكون من 6 أرقام لحماية حسابك",
    "abac_denied": "خطأ 403: تم حظر الوصول بموجب صلاحيات السمات الأمنية"
  },
  "dashboard": {
    "header_title": "غرفة التحكم والعمليات التنفيذية",
    "kpi_asset_valuation": "قيمة الأصول المخزنة الحالية",
    "kpi_projection_30d": "المسار المتوقع لقيمة المخزون (30 يوماً)",
    "regression_slope": "معدل ميل الانحدار الخطي لكل يوم",
    "confidence_high": "دقة تنبؤ عالية الذكاء"
  },
  "procurement": {
    "matching_engine": "محرك المطابقة الثلاثي لعقود التوريد",
    "status_matched": "متطابق مع المستندات",
    "status_discrepancy_hold": "محجوز لوجود فروقات في الكمية أو السعر",
    "invoice_number": "رقم الفاتورة"
  },
  "logistics": {
    "telemetry_panel": "مركز القيادة والتحكم المباشر لأسطول النقل",
    "canvas_radar_active": "رادار التتبع اللحظي مفعّل (60 إطار في الثانية)",
    "vehicle_id": "معرّف الشاحنة",
    "speed_kph": "كيلومتر / ساعة",
    "route_optimized": "تم تحسين مسار النقل متعدد المحطات بنجاح",
    "cold_chain_alert": "تحذير: اختلال درجة حرارة الشحنة المبردة"
  },
  "hr_payroll": {
    "employee_code": "الرقم الوظيفي",
    "attendance_biometric": "سجل البصمة الحيوية للحضور والانصراف",
    "gross_earnings": "إجمالي المستحقات",
    "deductions": "الاستقطاعات الجزائية",
    "net_pay": "صافي الراتب المستحق"
  }
}
```
