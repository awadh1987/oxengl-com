"""
OxenGL ERP - Multi-Destination Backup Service Scaffold (Phase B).
Filename: backend/app/services/backup_service.py

SCAFFOLD ONLY - nothing here is scheduled or called by the running application yet. It sets out the
domain model, destination-connector interface and worker entry points for the architecture in
``docs/architecture/password-reset-and-backup-strategy.md`` section 2:

  Scopes        TENANT   - one tenant's schema, attachments and generated invoices
                PLATFORM - global database dump, system configuration, audit logs
  Destinations  Private / sovereign: SFTP, rsync-over-SSH, WebDAV, S3-compatible (e.g. MinIO)
                Cloud (redundant):   Google Drive, Microsoft OneDrive (OAuth2)
  Schedule      daily incremental + weekly full (per-policy cron)

Existing building blocks to reuse when implementing (do not duplicate):
  * ``backend/scripts/weekly_active_snapshot.py``  - per-tenant ledger snapshots (.enc.tar.gz)
  * ``backend/scripts/replicate_offsite.py``        - S3-compatible offsite replication
  * ``backend/scripts/restore_tenant_backup.py``    - restore / reconstitution
  * ``backend/app/api/v1/super_admin.py``           - ``BACKUP_DIR`` + pre-purge archives

Security invariants for the implementation:
  * Archives are encrypted client-side (AES-256-GCM, per-archive data key wrapped by a KMS / master
    key) BEFORE they leave the host; destinations only ever receive ciphertext.
  * Destination credentials (SSH keys, S3 secrets, OAuth refresh tokens) are stored encrypted at rest,
    never logged, never returned by any API (write-only fields in the management consoles).
  * SFTP / SSH verifies pinned host keys (no auto-accept); WebDAV / S3 require TLS.
  * TENANT scope: the tenant id is derived from the authenticated caller, never from request input;
    a tenant policy can only target that tenant's data and destinations.
  * Remote paths are normalised and confined to the configured base path (no traversal).
  * Every run (success / failure / restore) is recorded in the tenant or platform audit log.
"""

from __future__ import annotations

import abc
import enum
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

logger = logging.getLogger("oxengl.backup")


# =============================================================================================
# Domain model
# =============================================================================================


class BackupScope(str, enum.Enum):
    TENANT = "tenant"
    PLATFORM = "platform"


class BackupKind(str, enum.Enum):
    FULL = "full"
    INCREMENTAL = "incremental"


class DestinationType(str, enum.Enum):
    SFTP = "sftp"
    RSYNC_SSH = "rsync_ssh"
    WEBDAV = "webdav"
    S3_COMPATIBLE = "s3_compatible"
    GOOGLE_DRIVE = "google_drive"
    ONEDRIVE = "onedrive"


class BackupRunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    PARTIAL = "partial"  # archive built but at least one destination failed
    FAILED = "failed"


@dataclass(frozen=True)
class DestinationConfig:
    """Non-secret destination settings. Secrets are referenced by ``credential_ref`` (encrypted store)."""

    id: uuid.UUID
    type: DestinationType
    name: str
    base_path: str = "/oxengl-backups"
    host: str | None = None
    port: int | None = None
    bucket: str | None = None
    pinned_host_key: str | None = None  # SFTP / rsync: required, no auto-accept
    credential_ref: str | None = None  # pointer into the encrypted credential vault
    enabled: bool = True


@dataclass
class BackupPolicy:
    """What to back up, when, and where. TENANT policies always carry the owning tenant id."""

    id: uuid.UUID
    scope: BackupScope
    tenant_id: uuid.UUID | None
    destinations: list[DestinationConfig]
    incremental_cron: str = "0 2 * * *"  # daily 02:00 UTC
    full_cron: str = "0 3 * * 0"  # weekly, Sunday 03:00 UTC
    retention_daily: int = 14
    retention_weekly: int = 8
    include_attachments: bool = True
    include_invoices: bool = True

    def __post_init__(self) -> None:
        if self.scope is BackupScope.TENANT and self.tenant_id is None:
            raise ValueError("TENANT backup policies must be bound to a tenant_id")
        if self.scope is BackupScope.PLATFORM and self.tenant_id is not None:
            raise ValueError("PLATFORM backup policies must not be bound to a tenant")


@dataclass
class BackupArtifact:
    """An encrypted archive produced locally, ready for upload."""

    path: Path
    scope: BackupScope
    kind: BackupKind
    tenant_id: uuid.UUID | None
    sha256: str
    size_bytes: int
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class UploadResult:
    destination_id: uuid.UUID
    ok: bool
    remote_path: str | None = None
    error: str | None = None


@dataclass
class BackupRun:
    policy_id: uuid.UUID
    kind: BackupKind
    status: BackupRunStatus = BackupRunStatus.PENDING
    artifact: BackupArtifact | None = None
    uploads: list[UploadResult] = field(default_factory=list)
    started_at: datetime | None = None
    finished_at: datetime | None = None


# =============================================================================================
# Destination connectors
# =============================================================================================


def confine_remote_path(base_path: str, *parts: str) -> str:
    """Join ``parts`` under ``base_path`` and refuse anything that escapes it (path traversal guard)."""
    base = PurePosixPath("/" + base_path.strip("/"))
    candidate = base.joinpath(*[p.strip("/") for p in parts])
    normalised: list[str] = []
    for segment in candidate.parts[1:]:
        if segment in ("", "."):
            continue
        if segment == "..":
            raise ValueError("remote path escapes the destination base path")
        normalised.append(segment)
    result = PurePosixPath("/", *normalised)
    if result != base and base not in result.parents:
        raise ValueError("remote path escapes the destination base path")
    return str(result)


class BackupDestination(abc.ABC):
    """Uploads an already-encrypted artifact to one destination."""

    type: DestinationType

    def __init__(self, config: DestinationConfig) -> None:
        if config.type is not self.type:
            raise ValueError(f"{type(self).__name__} cannot handle destination type {config.type.value}")
        self.config = config

    def remote_path_for(self, artifact: BackupArtifact) -> str:
        scope_dir = f"tenant-{artifact.tenant_id}" if artifact.scope is BackupScope.TENANT else "platform"
        return confine_remote_path(self.config.base_path, scope_dir, artifact.kind.value, artifact.path.name)

    @abc.abstractmethod
    def test_connection(self) -> None:
        """Raise on failure (bad credentials, unknown host key, missing bucket / folder...)."""

    @abc.abstractmethod
    def upload(self, artifact: BackupArtifact) -> UploadResult:
        """Upload ``artifact``; implementations must verify the remote checksum / size afterwards."""

    @abc.abstractmethod
    def prune(self, keep_daily: int, keep_weekly: int) -> int:
        """Apply retention under this policy's prefix only; return the number of objects removed."""


class SFTPDestination(BackupDestination):
    """Private server over SFTP (paramiko). Host key MUST match ``pinned_host_key``."""

    type = DestinationType.SFTP

    def test_connection(self) -> None:
        raise NotImplementedError("SFTP connector - Phase B")

    def upload(self, artifact: BackupArtifact) -> UploadResult:
        raise NotImplementedError("SFTP connector - Phase B")

    def prune(self, keep_daily: int, keep_weekly: int) -> int:
        raise NotImplementedError("SFTP connector - Phase B")


class RsyncSSHDestination(BackupDestination):
    """Private server via rsync over SSH (StrictHostKeyChecking=yes, pinned known_hosts)."""

    type = DestinationType.RSYNC_SSH

    def test_connection(self) -> None:
        raise NotImplementedError("rsync/SSH connector - Phase B")

    def upload(self, artifact: BackupArtifact) -> UploadResult:
        raise NotImplementedError("rsync/SSH connector - Phase B")

    def prune(self, keep_daily: int, keep_weekly: int) -> int:
        raise NotImplementedError("rsync/SSH connector - Phase B")


class WebDAVDestination(BackupDestination):
    """Private server / NAS over WebDAV (HTTPS only)."""

    type = DestinationType.WEBDAV

    def test_connection(self) -> None:
        raise NotImplementedError("WebDAV connector - Phase B")

    def upload(self, artifact: BackupArtifact) -> UploadResult:
        raise NotImplementedError("WebDAV connector - Phase B")

    def prune(self, keep_daily: int, keep_weekly: int) -> int:
        raise NotImplementedError("WebDAV connector - Phase B")


class S3CompatibleDestination(BackupDestination):
    """Private S3-compatible object storage (MinIO on-prem / private VPS). Reuse replicate_offsite.py logic."""

    type = DestinationType.S3_COMPATIBLE

    def test_connection(self) -> None:
        raise NotImplementedError("S3-compatible connector - Phase B")

    def upload(self, artifact: BackupArtifact) -> UploadResult:
        raise NotImplementedError("S3-compatible connector - Phase B")

    def prune(self, keep_daily: int, keep_weekly: int) -> int:
        raise NotImplementedError("S3-compatible connector - Phase B")


class GoogleDriveDestination(BackupDestination):
    """Google Drive via OAuth2 (drive.file scope only; refresh token held in the encrypted vault)."""

    type = DestinationType.GOOGLE_DRIVE

    def test_connection(self) -> None:
        raise NotImplementedError("Google Drive connector - Phase B")

    def upload(self, artifact: BackupArtifact) -> UploadResult:
        raise NotImplementedError("Google Drive connector - Phase B")

    def prune(self, keep_daily: int, keep_weekly: int) -> int:
        raise NotImplementedError("Google Drive connector - Phase B")


class OneDriveDestination(BackupDestination):
    """Microsoft OneDrive via Microsoft Graph OAuth2 (Files.ReadWrite.AppFolder; resumable upload sessions)."""

    type = DestinationType.ONEDRIVE

    def test_connection(self) -> None:
        raise NotImplementedError("OneDrive connector - Phase B")

    def upload(self, artifact: BackupArtifact) -> UploadResult:
        raise NotImplementedError("OneDrive connector - Phase B")

    def prune(self, keep_daily: int, keep_weekly: int) -> int:
        raise NotImplementedError("OneDrive connector - Phase B")


DESTINATION_REGISTRY: dict[DestinationType, type[BackupDestination]] = {
    DestinationType.SFTP: SFTPDestination,
    DestinationType.RSYNC_SSH: RsyncSSHDestination,
    DestinationType.WEBDAV: WebDAVDestination,
    DestinationType.S3_COMPATIBLE: S3CompatibleDestination,
    DestinationType.GOOGLE_DRIVE: GoogleDriveDestination,
    DestinationType.ONEDRIVE: OneDriveDestination,
}


def build_destination(config: DestinationConfig) -> BackupDestination:
    try:
        return DESTINATION_REGISTRY[config.type](config)
    except KeyError as err:
        raise ValueError(f"unsupported destination type: {config.type}") from err


# =============================================================================================
# Worker / service hooks
# =============================================================================================


class BackupService:
    """Orchestrates dump -> package -> encrypt -> fan-out upload -> retention -> audit."""

    def __init__(self, work_dir: Path) -> None:
        self.work_dir = work_dir

    # ---- stage 1: data extraction -------------------------------------------------------------
    def dump_tenant(self, tenant_id: uuid.UUID, kind: BackupKind) -> Path:
        """pg_dump of the tenant schema (+ attachments / invoices if enabled) into ``work_dir``."""
        raise NotImplementedError("tenant dump - Phase B (reuse weekly_active_snapshot.py)")

    def dump_platform(self, kind: BackupKind) -> Path:
        """Platform database dump, system configuration and audit logs into ``work_dir``."""
        raise NotImplementedError("platform dump - Phase B")

    # ---- stage 2: packaging + client-side encryption ------------------------------------------
    def package_and_encrypt(
        self, source: Path, scope: BackupScope, kind: BackupKind, tenant_id: uuid.UUID | None
    ) -> BackupArtifact:
        """tar.gz + AES-256-GCM (envelope encryption). Returns the ciphertext artifact with its checksum."""
        raise NotImplementedError("packaging/encryption - Phase B")

    # ---- stage 3: fan-out ---------------------------------------------------------------------
    def upload_all(self, artifact: BackupArtifact, destinations: list[DestinationConfig]) -> list[UploadResult]:
        """Upload to every enabled destination independently; one failure never blocks the others."""
        results: list[UploadResult] = []
        for cfg in destinations:
            if not cfg.enabled:
                continue
            try:
                results.append(build_destination(cfg).upload(artifact))
            except NotImplementedError:
                raise
            except Exception as err:  # noqa: BLE001 - isolate connector failures; continue with next destination
                logger.error("backup upload to destination %s failed: %s", cfg.id, type(err).__name__)
                results.append(UploadResult(destination_id=cfg.id, ok=False, error=type(err).__name__))
        return results

    # ---- entry points (called by the scheduler: celery beat / asyncio cron) -------------------
    def run_policy(self, policy: BackupPolicy, kind: BackupKind) -> BackupRun:
        """Execute one scheduled run of ``policy``. Records the outcome in the audit trail."""
        raise NotImplementedError("backup worker - Phase B")

    def restore(
        self, artifact_remote_path: str, destination: DestinationConfig, *, tenant_id: uuid.UUID | None
    ) -> None:
        """Download, verify checksum, decrypt and restore (reuse restore_tenant_backup.py)."""
        raise NotImplementedError("restore - Phase B")
