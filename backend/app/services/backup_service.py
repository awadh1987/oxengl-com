"""
OxenGL ERP - Full-Scope Multi-Destination Backup Service.
Filename: backend/app/services/backup_service.py

Implements the backup architecture in ``docs/architecture/password-reset-and-backup-strategy.md``
section 2. A single run captures EVERYTHING needed to rebuild its scope - data AND files:

  Scopes        TENANT   - the tenant's isolated PostgreSQL schema (pg_dump), the tenant's rows in shared
                           ``public`` tables (tenant_id / company_id scoped, exported from the SAME MVCC
                           snapshot as the schema dump), an optional dedicated data-residency database, and
                           the tenant's file assets: logo uploads, attachments, generated invoices, branding.
                PLATFORM - full master database dump (every schema: public + all tenant schemas), cluster
                           globals (roles / tablespaces, best effort), optional dedicated residency databases,
                           and every file-asset root for all tenants plus platform-wide media.
  Pipeline      dump -> stream tar.gz -> chunked AES-256-GCM (envelope) -> fan-out upload -> verify ->
                retention -> audit. The plaintext tarball never touches disk.
  Destinations  Private / sovereign: SFTP, rsync-over-SSH, WebDAV (HTTPS), S3-compatible (MinIO; SigV4)
                Cloud (redundant):   Google Drive, Microsoft OneDrive (OAuth2 refresh-token flow)
  Schedule      daily incremental + weekly full (per-policy cron; the scheduler calls ``run_policy``)

Building blocks this module aligns with:
  * ``backend/scripts/backup_postgres.sh``          - pg_dump flags; host client with docker-exec fallback
  * ``backend/database.py``                         - DATABASE_URL / POSTGRES_* resolution, RLS GUC names
  * ``backend/app/domains/planning/logo_upload.py`` - ``OXENGL_LOGO_UPLOAD_DIR`` flat ``logo_<tenant>_*`` files
  * ``backend/app/utils/crypto_vault.py``           - master key file (fallback key source)
  * ``backend/scripts/restore_tenant_backup.py``    - JSON ledger restore for the legacy snapshot archives

Security invariants (enforced in code below):
  * Archives are encrypted client-side (AES-256-GCM, fresh per-archive data key wrapped by the master key)
    BEFORE they leave the host; destinations only ever receive ciphertext. Chunks are bound to the header,
    their position and a final-chunk flag, so tampering, reordering and truncation are all detected.
  * Destination credentials (SSH keys, S3 secrets, OAuth refresh tokens) are resolved through a
    ``CredentialProvider`` by reference, never logged, never written to manifests or audit entries.
  * SFTP / rsync verify a pinned host key (StrictHostKeyChecking=yes, no auto-accept); WebDAV / S3 /
    OAuth2 endpoints require TLS.
  * Packaging: only regular files are archived (symlinks, devices, FIFOs are skipped, files are opened
    with O_NOFOLLOW), every source path is confined to its asset root, every member name is canonical
    and relative. Restore: only regular-file / directory members with canonical names are accepted and
    every write is confined to its target root.
  * Remote paths are normalised, confined to the destination base path and restricted to [A-Za-z0-9._/-].
  * TENANT scope: the tenant id comes from the policy (bound by the API layer to the authenticated caller);
    a restore refuses archives whose manifest belongs to another tenant or scope.
  * Every run (success / partial / failure / restore) is recorded in the tenant or platform audit log.

Environment:
  OXENGL_BACKUP_WORK_DIR        staging + local artifact directory (default /var/backups/oxengl/work)
  OXENGL_BACKUP_MASTER_KEY      32-byte key, base64 / base64url / hex (fallback: crypto_vault master key)
  OXENGL_BACKUP_PREVIOUS_KEYS   comma-separated retired keys still accepted for restore (key rotation)
  OXENGL_MEDIA_ROOT             platform media root (default /var/www/oxengl/media)
  OXENGL_LOGO_UPLOAD_DIR        logo uploads (same variable as logo_upload.py)
  OXENGL_ATTACHMENTS_DIR        attachments root, per-tenant sub-directories (<root>/<tenant_id>/...)
  OXENGL_INVOICES_DIR           generated invoices root, per-tenant sub-directories
  OXENGL_BRANDING_DIR           custom branding assets root, per-tenant sub-directories
  OXENGL_BACKUP_EXTRA_PATHS     platform scope only: extra paths (os.pathsep separated), e.g. config dirs
  OXENGL_PG_CONTAINER           docker fallback container (default oxengl_postgres_container)
  OXENGL_BACKUP_DUMP_TIMEOUT    pg_dump / pg_restore timeout in seconds (default 21600)
  OXENGL_BACKUP_CRED_<REF>      JSON credential blob for ``EnvCredentialProvider`` (dev / container secrets)
"""

from __future__ import annotations

import abc
import base64
import contextlib
import enum
import fcntl
import gzip
import hashlib
import hmac
import io
import json
import logging
import os
import posixpath
import re
import shlex
import shutil
import socket
import ssl
import stat
import struct
import subprocess
import tarfile
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import IO, Any, ClassVar, Protocol, Self
from urllib.parse import quote, unquote, urlsplit
from xml.sax.saxutils import escape as xml_escape

import httpx
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.engine import make_url

logger = logging.getLogger("oxengl.backup")


# =============================================================================================
# Constants and validation patterns
# =============================================================================================

ARCHIVE_SUFFIX = ".tar.gz.enc"
CHECKSUM_SUFFIX = ".sha256"
MANIFEST_NAME = "manifest.json"
MANIFEST_FORMAT = "oxengl-backup"
MANIFEST_VERSION = 1

_ARTIFACT_NAME_RE = re.compile(
    r"^oxengl-(tenant|platform)-(full|incremental)-(\d{8}T\d{6}Z)-([0-9a-f]{8})\.tar\.gz\.enc$"
)
_SAFE_REMOTE_PATH_RE = re.compile(r"^/[A-Za-z0-9._/-]*$")
_SAFE_LOCAL_PATH_RE = re.compile(r"^/[A-Za-z0-9._/@+-]+$")
_SCHEMA_RE = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
_TABLE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")
_HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$")
_USER_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$")
_HOST_KEY_RE = re.compile(
    r"^(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com"
    r"|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/]+={0,3}$"
)
_CONTAINER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
_BUCKET_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
_REGION_RE = re.compile(r"^[a-z0-9-]{1,32}$")
_CRED_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
_DRIVE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_MS_TENANT_RE = re.compile(r"^[A-Za-z0-9.-]{1,64}$")
_SHA256_HEX_RE = re.compile(r"^[0-9a-f]{64}$")

_SSH_HOST_ALIAS = "oxengl-backup-target"
_DEFAULT_TIMEOUT_S = 120.0
_DEFAULT_TRANSFER_TIMEOUT_S = 6 * 3600.0
_COPY_BUFSIZE = 1024 * 1024


# =============================================================================================
# Errors
# =============================================================================================


class BackupError(RuntimeError):
    """Operational failure. Messages are composed by this module and are safe to log / audit."""


class BackupIntegrityError(BackupError):
    """Checksum, size, authentication-tag or manifest mismatch."""


class PathTraversalError(BackupError, ValueError):
    """A local path, archive member or remote path tried to escape its confinement root."""


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
    """Non-secret destination settings. Secrets are referenced by ``credential_ref`` (encrypted store).

    ``options`` carries connector-specific, non-secret settings:
      all            timeout (s, per request), transfer_timeout (s, whole transfer)
      webdav         url (https base URL, optional - else https://host[:port]), ca_bundle
      s3_compatible  endpoint (https URL, optional - else https://host[:port]), region, part_size_mb,
                     sse ("AES256" to request server-side encryption on top), ca_bundle
      google_drive   folder_id (parent folder; default "root")
      onedrive       tenant ("common" | "consumers" | "organizations" | <tenant-id>)

    Credential blobs (resolved by ``CredentialProvider.get(credential_ref)``):
      sftp / rsync_ssh   private_key (OpenSSH PEM, unencrypted)
      webdav             password (+ username if not set on the config)
      s3_compatible      access_key_id, secret_access_key, [session_token]
      google_drive       client_id, client_secret, refresh_token
      onedrive           client_id, refresh_token, [client_secret]
    """

    id: uuid.UUID
    type: DestinationType
    name: str
    base_path: str = "/oxengl-backups"
    host: str | None = None
    port: int | None = None
    bucket: str | None = None
    username: str | None = None
    pinned_host_key: str | None = None  # SFTP / rsync: required, no auto-accept
    credential_ref: str | None = None  # pointer into the encrypted credential vault
    options: Mapping[str, str] = field(default_factory=dict)
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
    include_branding: bool = True  # logo uploads + custom branding assets

    def __post_init__(self) -> None:
        if self.scope is BackupScope.TENANT and self.tenant_id is None:
            raise ValueError("TENANT backup policies must be bound to a tenant_id")
        if self.scope is BackupScope.PLATFORM and self.tenant_id is not None:
            raise ValueError("PLATFORM backup policies must not be bound to a tenant")
        if self.retention_daily < 1 or self.retention_weekly < 1:
            raise ValueError("retention must keep at least one archive of each kind")


@dataclass
class BackupArtifact:
    """An encrypted archive produced locally, ready for upload."""

    path: Path
    scope: BackupScope
    kind: BackupKind
    tenant_id: uuid.UUID | None
    sha256: str  # of the ciphertext file
    size_bytes: int
    backup_id: uuid.UUID = field(default_factory=uuid.uuid4)
    key_id: str = ""
    checksum_path: Path | None = None  # "<sha256>  <name>" sidecar uploaded next to the archive
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class UploadResult:
    destination_id: uuid.UUID
    ok: bool
    remote_path: str | None = None
    error: str | None = None
    attempts: int = 1
    verified: str | None = None  # "size" or "size+sha256"
    started_at: datetime | None = None  # per-destination timing (all attempts), used for run-log rows
    finished_at: datetime | None = None


@dataclass
class BackupRun:
    policy_id: uuid.UUID
    kind: BackupKind
    status: BackupRunStatus = BackupRunStatus.PENDING
    artifact: BackupArtifact | None = None
    uploads: list[UploadResult] = field(default_factory=list)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    pruned: int = 0
    error: str | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class RestoreResult:
    manifest: dict[str, Any]
    extracted_dir: Path
    database_restored: bool = False
    files_restored: int = 0
    warnings: list[str] = field(default_factory=list)

    def cleanup(self) -> None:
        """Remove the decrypted staging copy once the operator no longer needs it."""
        shutil.rmtree(self.extracted_dir.parent, ignore_errors=True)


# =============================================================================================
# Path security
# =============================================================================================


def confine_remote_path(base_path: str, *parts: str) -> str:
    """Join ``parts`` under ``base_path`` and refuse anything that escapes it (path traversal guard)."""
    if "\x00" in base_path or any("\x00" in p for p in parts):
        raise PathTraversalError("remote path contains a NUL byte")
    base = PurePosixPath("/" + base_path.strip("/"))
    candidate = base.joinpath(*[p.strip("/") for p in parts])
    normalised: list[str] = []
    for segment in candidate.parts[1:]:
        if segment in ("", "."):
            continue
        if segment == "..":
            raise PathTraversalError("remote path escapes the destination base path")
        normalised.append(segment)
    result = PurePosixPath("/", *normalised)
    if result != base and base not in result.parents:
        raise PathTraversalError("remote path escapes the destination base path")
    return str(result)


def _assert_safe_remote(path: str) -> str:
    if not _SAFE_REMOTE_PATH_RE.fullmatch(path):
        raise PathTraversalError("remote path contains unsupported characters (allowed: A-Z a-z 0-9 . _ - /)")
    return path


def _assert_safe_local(path: Path) -> str:
    text = str(path)
    if not _SAFE_LOCAL_PATH_RE.fullmatch(text):
        raise PathTraversalError("local path contains characters that are unsafe for SFTP batch mode")
    return text


def ensure_within(root: Path, candidate: Path) -> Path:
    """Resolve ``candidate`` (following symlinks) and require it to stay inside ``root``."""
    root_resolved = root.resolve()
    resolved = candidate.resolve()
    if resolved != root_resolved and not resolved.is_relative_to(root_resolved):
        raise PathTraversalError("path escapes its confinement root")
    return resolved


def safe_arcname(*parts: str) -> str:
    """Build a canonical, relative archive member name; reject NUL bytes and ``..`` segments."""
    segments: list[str] = []
    for part in parts:
        if "\x00" in part:
            raise PathTraversalError("archive member name contains a NUL byte")
        for segment in part.split("/"):
            if segment in ("", "."):
                continue
            if segment == "..":
                raise PathTraversalError("archive member name contains a parent-directory segment")
            segments.append(segment)
    if not segments:
        raise PathTraversalError("empty archive member name")
    return "/".join(segments)


def _path_prefixes(remote_dir: str) -> list[str]:
    segments = [s for s in remote_dir.split("/") if s]
    return ["/" + "/".join(segments[: i + 1]) for i in range(len(segments))]


# =============================================================================================
# Local file helpers
# =============================================================================================


def _open_private_write(path: Path, *, exclusive: bool = False) -> IO[bytes]:
    """Open for writing with 0600 permissions, never following a symlink at ``path``."""
    flags = os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC)
    flags |= getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
    return os.fdopen(os.open(path, flags, 0o600), "wb")


def _write_private(path: Path, data: bytes) -> None:
    with _open_private_write(path) as fh:
        fh.write(data)


def _prepare_private_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)
    return path


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(_COPY_BUFSIZE):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_checksum_file(path: Path, expected_name: str) -> str:
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    fields = lines[0].split() if lines else []
    if len(fields) != 2 or not _SHA256_HEX_RE.fullmatch(fields[0].lower()) or fields[1] != expected_name:
        raise BackupIntegrityError("checksum sidecar is malformed or names a different archive")
    return fields[0].lower()


def _child_env(**extra: str | None) -> dict[str, str]:
    env = dict(os.environ)
    env.pop("SSH_AUTH_SOCK", None)  # never let a stray agent supply identities
    env.update({k: v for k, v in extra.items() if v is not None})
    return env


def _run(
    argv: list[str],
    *,
    what: str,
    timeout: float,
    env: Mapping[str, str] | None = None,
    input_bytes: bytes | None = None,
    stdin: IO[bytes] | None = None,
    stdout: IO[bytes] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    """Run a child process without a shell. Secrets travel via ``env`` / files, never via ``argv``."""
    try:
        proc = subprocess.run(
            argv,
            input=input_bytes,
            stdin=stdin if input_bytes is None else None,
            stdout=stdout if stdout is not None else subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=dict(env) if env is not None else None,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as err:
        raise BackupError(f"{what}: executable {argv[0]!r} not found") from err
    except subprocess.TimeoutExpired as err:
        raise BackupError(f"{what}: timed out after {int(timeout)}s") from err
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip()[-800:]
        raise BackupError(f"{what} failed (exit {proc.returncode}): {tail}")
    return proc


_PEM_BLOCK_RE = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)", re.S)
_BEARER_RE = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}")
_KV_SECRET_RE = re.compile(
    r"(?i)\b([\w.-]*(?:secret|token|password|passwd|private[_-]?key|access[_-]?key|authorization|credential)[\w.-]*)"
    r"(\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|\S+)"
)
_LONG_TOKEN_RE = re.compile(r"[A-Za-z0-9+/_=-]{40,}")
_MAX_ERROR_LEN = 500


def redact_secrets(message: str, known_secrets: Iterable[str] = (), *, max_len: int = _MAX_ERROR_LEN) -> str:
    """Scrub anything credential-shaped from a message destined for logs / audit / API responses, then truncate.

    Removes PEM private keys, bearer/basic credentials, ``secret=...`` style pairs, long opaque tokens, and every
    literal value in ``known_secrets`` (the credential values resolved for the destination in question).
    """
    text = str(message or "")
    for secret in known_secrets:
        if secret and len(secret) >= 4:
            text = text.replace(secret, "[REDACTED]")
    text = _PEM_BLOCK_RE.sub("[REDACTED]", text)
    text = _BEARER_RE.sub(lambda m: f"{m.group(1)} [REDACTED]", text)
    text = _KV_SECRET_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED]", text)
    text = _LONG_TOKEN_RE.sub(lambda m: m.group(0) if m.group(0).startswith("oxengl-") else "[REDACTED]", text)
    text = "".join(ch if ch.isprintable() or ch in "\n\t" else " " for ch in text).strip()
    return text if len(text) <= max_len else text[: max_len - 3] + "..."


def _safe_error(err: BaseException) -> str:
    """Audit-safe error string: our own messages (credential-scrubbed), third-party errors by class name only."""
    if isinstance(err, BackupError):
        return redact_secrets(f"{type(err).__name__}: {err}")
    return type(err).__name__


# =============================================================================================
# Encryption - chunked AES-256-GCM with envelope key wrapping
# =============================================================================================
#
# File layout:  HEADER || C_0 || C_1 || ... || C_n
#   HEADER (84 bytes) = magic "OXBK" | version u8 | chunk_size u32 | key_id 8B | wrap_nonce 12B |
#                       wrapped_dek 48B (AES-GCM(master_key, dek, aad=WRAP_AAD||key_id)) | nonce_prefix 7B
#   C_i = AES-256-GCM(dek, nonce = prefix || u32(i) || final_flag, plaintext_i, aad = HEADER)
#   Every chunk except the last carries exactly ``chunk_size`` plaintext bytes; the last carries 0..chunk_size
#   bytes and final_flag=1. Truncation at a chunk boundary therefore fails authentication.

_HEADER = struct.Struct(">4sBI8s12s48s7s")
_MAGIC = b"OXBK"
_FORMAT_VERSION = 1
_DEFAULT_CHUNK = 4 * 1024 * 1024
_GCM_TAG = 16
_WRAP_AAD = b"oxengl-backup/dek-wrap/v1"
_MAX_CHUNKS = 2**32 - 1


def key_fingerprint(key: bytes) -> bytes:
    """Non-secret 8-byte identifier of a master key (stored in the archive header for key rotation)."""
    return hashlib.sha256(b"oxengl-backup-key-id/v1" + key).digest()[:8]


def _decode_key(value: str, name: str) -> bytes:
    text = value.strip()
    if re.fullmatch(r"[0-9a-fA-F]{64}", text):
        raw = bytes.fromhex(text)
    else:
        try:
            normalised = text.replace("+", "-").replace("/", "_")
            raw = base64.urlsafe_b64decode(normalised + "=" * (-len(normalised) % 4))
        except ValueError as err:
            raise BackupError(f"{name} is not valid base64 / hex") from err
    if len(raw) != 32:
        raise BackupError(f"{name} must encode exactly 32 bytes (AES-256)")
    return raw


class BackupKeyProvider(Protocol):
    def current(self) -> tuple[bytes, bytes]:
        """Return ``(key_id, key)`` used to encrypt new archives."""
        ...

    def lookup(self, key_id: bytes) -> bytes:
        """Return the key with ``key_id`` (current or retired) for decryption."""
        ...


class DefaultKeyProvider:
    """OXENGL_BACKUP_MASTER_KEY (+ retired OXENGL_BACKUP_PREVIOUS_KEYS), else the crypto_vault master key.

    Escrow the master key OUTSIDE the backup destinations: without it no archive can be decrypted.
    Production deployments can inject a KMS-backed provider implementing ``BackupKeyProvider``.
    """

    def __init__(self) -> None:
        self._keys: dict[bytes, bytes] = {}
        self._current: bytes | None = None

    def _load(self) -> bytes:
        if self._current is not None:
            return self._current
        configured = os.getenv("OXENGL_BACKUP_MASTER_KEY")
        if configured:
            key = _decode_key(configured, "OXENGL_BACKUP_MASTER_KEY")
        else:
            try:
                from backend.app.utils.crypto_vault import ensure_master_key
            except ImportError as err:
                raise BackupError("no backup master key configured (set OXENGL_BACKUP_MASTER_KEY)") from err
            key = ensure_master_key()
            if len(key) != 32:
                raise BackupError("crypto_vault master key is not a 256-bit key")
            logger.warning("OXENGL_BACKUP_MASTER_KEY is not set; using the crypto_vault master key file")
        key_id = key_fingerprint(key)
        self._keys[key_id] = key
        previous = [s.strip() for s in os.getenv("OXENGL_BACKUP_PREVIOUS_KEYS", "").split(",") if s.strip()]
        for index, item in enumerate(previous):
            old = _decode_key(item, f"OXENGL_BACKUP_PREVIOUS_KEYS[{index}]")
            self._keys[key_fingerprint(old)] = old
        for search_dir in ("/var/crypto/oxengl", os.path.expanduser("~/.oxengl")):
            if os.path.isdir(search_dir):
                try:
                    for fname in os.listdir(search_dir):
                        if fname.endswith(".key") or fname.startswith("master"):
                            fpath = os.path.join(search_dir, fname)
                            if os.path.isfile(fpath):
                                try:
                                    with open(fpath, "rb") as kf:
                                        kbytes = kf.read()
                                    if len(kbytes) == 32:
                                        self._keys[key_fingerprint(kbytes)] = kbytes
                                except Exception:
                                    pass
                except Exception:
                    pass
        self._current = key_id
        return key_id

    def current(self) -> tuple[bytes, bytes]:
        key_id = self._load()
        return key_id, self._keys[key_id]

    def lookup(self, key_id: bytes) -> bytes:
        self._load()
        try:
            return self._keys[key_id]
        except KeyError as err:
            raise BackupError(f"archive was encrypted with unknown key id {key_id.hex()}") from err


def _chunk_nonce(prefix: bytes, counter: int, final: bool) -> bytes:
    return prefix + struct.pack(">I", counter) + (b"\x01" if final else b"\x00")


class EncryptingWriter:
    """Write-only file object: plaintext in, authenticated chunked AES-256-GCM ciphertext out to ``sink``."""

    def __init__(self, sink: Any, key: bytes, key_id: bytes, chunk_size: int = _DEFAULT_CHUNK) -> None:
        if len(key) != 32:
            raise BackupError("backup master key must be 32 bytes")
        dek = AESGCM.generate_key(bit_length=256)
        wrap_nonce = os.urandom(12)
        wrapped = AESGCM(key).encrypt(wrap_nonce, dek, _WRAP_AAD + key_id)
        prefix = os.urandom(7)
        self._header = _HEADER.pack(_MAGIC, _FORMAT_VERSION, chunk_size, key_id, wrap_nonce, wrapped, prefix)
        self._prefix = prefix
        self._aead = AESGCM(dek)
        self._sink = sink
        self._chunk = chunk_size
        self._buf = bytearray()
        self._counter = 0
        self.closed = False
        sink.write(self._header)

    def write(self, data: bytes) -> int:
        if self.closed:
            raise ValueError("write to a closed EncryptingWriter")
        self._buf += data
        # Strictly greater: always hold back up to one chunk so the final chunk can be flagged on close().
        while len(self._buf) > self._chunk:
            self._emit(bytes(self._buf[: self._chunk]), final=False)
            del self._buf[: self._chunk]
        return len(data)

    def flush(self) -> None:
        """Chunk boundaries are fixed; data is emitted on chunk fill / close only."""

    def close(self) -> None:
        if self.closed:
            return
        self._emit(bytes(self._buf), final=True)
        self._buf.clear()
        self.closed = True

    def _emit(self, plaintext: bytes, *, final: bool) -> None:
        if self._counter > _MAX_CHUNKS:
            raise BackupError("archive exceeds the maximum number of encrypted chunks")
        nonce = _chunk_nonce(self._prefix, self._counter, final)
        self._sink.write(self._aead.encrypt(nonce, plaintext, self._header))
        self._counter += 1


def _read_exact(source: IO[bytes], size: int) -> bytes:
    out = bytearray()
    while len(out) < size:
        chunk = source.read(size - len(out))
        if not chunk:
            break
        out += chunk
    return bytes(out)


class DecryptingReader:
    """Read-only file object over an encrypted archive; every chunk is authenticated before release."""

    def __init__(self, source: IO[bytes], key_provider: BackupKeyProvider) -> None:
        header = _read_exact(source, _HEADER.size)
        if len(header) != _HEADER.size:
            raise BackupIntegrityError("truncated archive header")
        magic, version, chunk, key_id, wrap_nonce, wrapped, prefix = _HEADER.unpack(header)
        if magic != _MAGIC:
            raise BackupIntegrityError("not an OxenGL encrypted backup archive")
        if version != _FORMAT_VERSION:
            raise BackupError(f"unsupported archive format version {version}")
        if not 64 * 1024 <= chunk <= 64 * 1024 * 1024:
            raise BackupIntegrityError("invalid chunk size in archive header")
        key = key_provider.lookup(key_id)
        try:
            dek = AESGCM(key).decrypt(wrap_nonce, wrapped, _WRAP_AAD + key_id)
        except InvalidTag as err:
            raise BackupIntegrityError("data key unwrap failed (wrong key or tampered header)") from err
        self.key_id = key_id
        self._aead = AESGCM(dek)
        self._header = header
        self._prefix = prefix
        self._source = source
        self._block = chunk + _GCM_TAG
        self._counter = 0
        self._buf = bytearray()
        self._done = False
        self._next = _read_exact(source, self._block)

    @property
    def finished(self) -> bool:
        return self._done and not self._buf

    def _fill(self) -> None:
        current = self._next
        self._next = _read_exact(self._source, self._block) if len(current) == self._block else b""
        final = not self._next
        if len(current) < _GCM_TAG:
            raise BackupIntegrityError("truncated archive chunk")
        nonce = _chunk_nonce(self._prefix, self._counter, final)
        try:
            plaintext = self._aead.decrypt(nonce, current, self._header)
        except InvalidTag as err:
            raise BackupIntegrityError("archive chunk failed authentication (corrupt, truncated or tampered)") from err
        self._counter += 1
        self._buf += plaintext
        self._done = final

    def read(self, size: int | None = -1) -> bytes:
        while not self._done and (size is None or size < 0 or len(self._buf) < size):
            self._fill()
        if size is None or size < 0:
            size = len(self._buf)
        out = bytes(self._buf[:size])
        del self._buf[:size]
        return out


def decrypt_archive(archive: Path, output: Path, key_provider: BackupKeyProvider | None = None) -> None:
    """Operator helper: decrypt ``archive`` to a plain ``.tar.gz`` at ``output`` (0600)."""
    provider = key_provider or DefaultKeyProvider()
    with open(archive, "rb") as src, _open_private_write(output, exclusive=True) as dst:
        reader = DecryptingReader(src, provider)
        while chunk := reader.read(_COPY_BUFSIZE):
            dst.write(chunk)
        if not reader.finished:
            raise BackupIntegrityError("archive ended before its final chunk")


class _HashingSink:
    """Pass-through writer that hashes and counts what reaches the archive file (the ciphertext)."""

    def __init__(self, raw: IO[bytes]) -> None:
        self._raw = raw
        self._digest = hashlib.sha256()
        self.size = 0

    def write(self, data: bytes) -> int:
        self._raw.write(data)
        self._digest.update(data)
        self.size += len(data)
        return len(data)

    def flush(self) -> None:
        self._raw.flush()

    def hexdigest(self) -> str:
        return self._digest.hexdigest()


class _MemberReader:
    """Feeds exactly ``size`` bytes of an open file into tarfile while hashing them.

    If the file shrinks while being archived the remainder is zero-padded so the tar stream stays valid;
    the entry is then flagged ``changed_during_backup`` in the manifest.
    """

    def __init__(self, fh: IO[bytes], size: int) -> None:
        self._fh = fh
        self._remaining = size
        self._digest = hashlib.sha256()
        self.short_read = False

    def read(self, size: int | None = -1) -> bytes:
        if self._remaining <= 0:
            return b""
        want = self._remaining if size is None or size < 0 else min(size, self._remaining)
        data = self._fh.read(want)
        if len(data) < want:
            self.short_read = True
            data += b"\0" * (want - len(data))
        self._remaining -= len(data)
        self._digest.update(data)
        return data

    def hexdigest(self) -> str:
        return self._digest.hexdigest()


# =============================================================================================
# File assets (uploads, attachments, invoices, branding)
# =============================================================================================


@dataclass(frozen=True)
class StorageLayout:
    """Where file assets live. Tenant data sits in ``<root>/<tenant_id>/`` except logos (flat, prefixed)."""

    media_root: Path
    logos_dir: Path
    attachments_dir: Path
    invoices_dir: Path
    branding_dir: Path
    extra_paths: tuple[Path, ...] = ()

    @classmethod
    def from_env(cls) -> StorageLayout:
        media = Path(os.getenv("OXENGL_MEDIA_ROOT", "/var/www/oxengl/media"))
        logos = Path(os.getenv("OXENGL_LOGO_UPLOAD_DIR", "/var/www/oxengl/media/logos"))
        if not logos.exists():
            fallback = Path.home() / ".oxengl" / "media" / "logos"  # logo_upload.py fallback location
            if fallback.exists():
                logos = fallback
        extra = tuple(Path(p) for p in os.getenv("OXENGL_BACKUP_EXTRA_PATHS", "").split(os.pathsep) if p.strip())
        return cls(
            media_root=media,
            logos_dir=logos,
            attachments_dir=Path(os.getenv("OXENGL_ATTACHMENTS_DIR", str(media / "attachments"))),
            invoices_dir=Path(os.getenv("OXENGL_INVOICES_DIR", str(media / "invoices"))),
            branding_dir=Path(os.getenv("OXENGL_BRANDING_DIR", str(media / "branding"))),
            extra_paths=extra,
        )


@dataclass(frozen=True)
class AssetSource:
    label: str  # archive prefix: files/<label>/...
    root: Path
    name_prefix: str | None = None  # flat directories shared by all tenants (logo uploads)
    recursive: bool = True
    exclude_dirs: tuple[Path, ...] = ()  # nested roots captured under their own label (or disabled)


def _is_nested(child: Path, parent: Path) -> bool:
    child_r, parent_r = child.resolve(), parent.resolve()
    return child_r != parent_r and child_r.is_relative_to(parent_r)


def asset_sources_for(
    layout: StorageLayout,
    scope: BackupScope,
    tenant_id: uuid.UUID | None,
    *,
    include_attachments: bool = True,
    include_invoices: bool = True,
    include_branding: bool = True,
) -> list[AssetSource]:
    """Asset roots for a scope. Used both to build archives and to map them back on restore."""
    if scope is BackupScope.TENANT:
        if tenant_id is None:
            raise ValueError("tenant scope requires a tenant_id")
        tid = str(uuid.UUID(str(tenant_id)))
        sources: list[AssetSource] = []
        if include_branding:
            sources.append(AssetSource("logos", layout.logos_dir, name_prefix=f"logo_{tid}_", recursive=False))
            sources.append(AssetSource("branding", layout.branding_dir / tid))
        if include_attachments:
            sources.append(AssetSource("attachments", layout.attachments_dir / tid))
        if include_invoices:
            sources.append(AssetSource("invoices", layout.invoices_dir / tid))
        return sources

    named = [
        ("logos", layout.logos_dir, include_branding),
        ("branding", layout.branding_dir, include_branding),
        ("attachments", layout.attachments_dir, include_attachments),
        ("invoices", layout.invoices_dir, include_invoices),
    ]
    media = layout.media_root
    nested = tuple(root for _, root, _ in named if _is_nested(root, media))
    sources = [AssetSource("media", media, exclude_dirs=nested)]
    for label, root, enabled in named:
        if enabled and root.resolve() != media.resolve():
            sources.append(AssetSource(label, root))
    for index, extra in enumerate(layout.extra_paths):
        sources.append(AssetSource(f"extra-{index}", extra))
    return sources


def iter_asset_files(source: AssetSource, *, since: float | None) -> Iterator[tuple[Path, str]]:
    """Yield ``(path, arcname)`` for regular files under ``source``; symlinks / special files are skipped."""
    if not source.root.is_dir():
        return
    root = source.root.resolve(strict=True)
    excluded = {p.resolve() for p in source.exclude_dirs}
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        current = Path(dirpath)
        if source.recursive:
            dirnames[:] = sorted(
                d for d in dirnames if not (current / d).is_symlink() and (current / d).resolve() not in excluded
            )
        else:
            dirnames[:] = []
        for name in sorted(filenames):
            if source.name_prefix and not name.startswith(source.name_prefix):
                continue
            path = current / name
            try:
                st = path.lstat()
            except OSError:
                continue  # vanished between listing and stat
            if not stat.S_ISREG(st.st_mode):
                continue
            # ctime catches files moved into place with an old mtime.
            if since is not None and max(st.st_mtime, st.st_ctime) < since:
                continue
            ensure_within(root, path)
            yield path, safe_arcname("files", source.label, path.relative_to(root).as_posix())


class _SkipFile(Exception):
    """File disappeared or turned into a non-regular file between discovery and open."""


def _open_member_source(path: Path) -> tuple[IO[bytes], os.stat_result]:
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0))
    except OSError as err:  # ENOENT (vanished) / ELOOP (became a symlink)
        raise _SkipFile(str(path)) from err
    fh = os.fdopen(fd, "rb")
    st = os.fstat(fh.fileno())
    if not stat.S_ISREG(st.st_mode):
        fh.close()
        raise _SkipFile(str(path))
    return fh, st


def _add_file_member(tar: tarfile.TarFile, path: Path, arcname: str) -> dict[str, Any]:
    fh, st = _open_member_source(path)
    with fh:
        info = tarfile.TarInfo(arcname)
        info.size = st.st_size
        info.mtime = int(st.st_mtime)
        info.mode = stat.S_IMODE(st.st_mode) & 0o777
        info.uid = info.gid = 0
        info.uname = info.gname = ""
        info.type = tarfile.REGTYPE
        reader = _MemberReader(fh, st.st_size)
        tar.addfile(info, reader)  # type: ignore[arg-type]
        after = os.fstat(fh.fileno())
    changed = reader.short_read or after.st_size != st.st_size or after.st_mtime_ns != st.st_mtime_ns
    return {
        "path": arcname,
        "size": st.st_size,
        "sha256": reader.hexdigest(),
        "mtime": int(st.st_mtime),
        "mode": info.mode,
        "changed_during_backup": changed,
    }


def _add_bytes_member(tar: tarfile.TarFile, arcname: str, data: bytes) -> None:
    info = tarfile.TarInfo(arcname)
    info.size = len(data)
    info.mtime = int(time.time())
    info.mode = 0o600
    tar.addfile(info, io.BytesIO(data))


# =============================================================================================
# PostgreSQL - pg_dump / pg_restore (aligned with scripts/backup_postgres.sh)
# =============================================================================================


@dataclass(frozen=True)
class PgConnectionInfo:
    host: str
    port: int
    user: str
    dbname: str
    password: str = field(default="", repr=False)

    @classmethod
    def from_url(cls, url: str) -> PgConnectionInfo:
        parsed = make_url(url)
        if not parsed.get_backend_name().startswith("postgresql"):
            raise BackupError("only PostgreSQL databases are supported")
        return cls(
            host=parsed.host or "127.0.0.1",
            port=int(parsed.port or 5432),
            user=parsed.username or "postgres",
            dbname=parsed.database or "postgres",
            password=parsed.password or "",
        )

    @classmethod
    def from_env(cls) -> PgConnectionInfo:
        """Same resolution order and defaults as ``backend.database.get_database_url``."""
        configured = os.getenv("DATABASE_URL")
        if configured:
            return cls.from_url(configured)
        return cls(
            host=os.getenv("POSTGRES_HOST", "127.0.0.1"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            user=os.getenv("POSTGRES_USER", "postgres"),
            dbname=os.getenv("POSTGRES_DB", "erp_db"),
            password=os.getenv("POSTGRES_PASSWORD", "postgres"),
        )


class PostgresDumper:
    """Runs pg_dump / pg_dumpall / pg_restore the way ``scripts/backup_postgres.sh`` does: the host client
    first, then ``docker exec`` into the compose Postgres container (also used automatically when the host
    client fails, e.g. on a client/server version mismatch). The password travels as PGPASSWORD in the child
    environment - ``docker exec -e PGPASSWORD`` forwards it by name - and never appears on a command line.
    """

    def __init__(
        self,
        conn: PgConnectionInfo,
        *,
        container: str | None = None,
        use_container_socket: bool = True,
        timeout: float = _DEFAULT_TRANSFER_TIMEOUT_S,
    ) -> None:
        self.conn = conn
        self.container = (
            container if container is not None else os.getenv("OXENGL_PG_CONTAINER", "oxengl_postgres_container")
        )
        if self.container and not _CONTAINER_RE.fullmatch(self.container):
            raise BackupError("invalid Postgres container name")
        self.use_container_socket = use_container_socket  # False for dedicated (non-compose) servers
        self.timeout = timeout
        self._container_ok: bool | None = None

    def _container_available(self) -> bool:
        if self._container_ok is None:
            self._container_ok = False
            if self.container and shutil.which("docker"):
                try:
                    proc = subprocess.run(
                        ["docker", "inspect", "-f", "{{.State.Running}}", self.container],
                        capture_output=True,
                        timeout=20,
                        check=False,
                    )
                    self._container_ok = proc.returncode == 0 and proc.stdout.strip() == b"true"
                except (OSError, subprocess.TimeoutExpired):
                    self._container_ok = False
        return self._container_ok

    def _conn_args(self, *, in_container: bool) -> list[str]:
        if in_container and self.use_container_socket:
            return ["-U", self.conn.user]  # local socket inside the container, as in backup_postgres.sh
        return ["-h", self.conn.host, "-p", str(self.conn.port), "-U", self.conn.user]

    def _execute(
        self, tool: str, args: list[str], *, what: str, stdout_path: Path | None = None, stdin_path: Path | None = None
    ) -> None:
        env = _child_env(PGPASSWORD=self.conn.password, PGAPPNAME="oxengl-backup", PGCONNECT_TIMEOUT="20")
        modes = [False] if shutil.which(tool) else []
        if self._container_available():
            modes.append(True)
        if not modes:
            raise BackupError(f"neither a host {tool} nor the Postgres container {self.container!r} is available")
        for index, in_container in enumerate(modes):
            if in_container:
                argv = ["docker", "exec", "-i", "-e", "PGPASSWORD", "-e", "PGAPPNAME", "-e", "PGCONNECT_TIMEOUT"]
                argv += [self.container or "", tool, *self._conn_args(in_container=True), *args]
            else:
                argv = [tool, *self._conn_args(in_container=False), *args]
            try:
                with contextlib.ExitStack() as stack:
                    out = stack.enter_context(_open_private_write(stdout_path)) if stdout_path else None
                    inp = stack.enter_context(open(stdin_path, "rb")) if stdin_path else None
                    _run(argv, what=what, timeout=self.timeout, env=env, stdin=inp, stdout=out)
                return
            except BackupError as err:
                if index + 1 < len(modes):
                    logger.warning("%s via host client failed (%s); retrying inside %s", what, err, self.container)
                    continue
                raise

    def dump_database(
        self, out: Path, *, schema: str | None = None, snapshot: str | None = None, dbname: str | None = None
    ) -> None:
        # Custom format (selective pg_restore). No inner compression: the outer tar.gz compresses once.
        args = ["-d", dbname or self.conn.dbname, "--format=custom", "--compress=0", "--no-owner"]
        args.append("--lock-wait-timeout=300s")
        if schema is not None:
            if not _SCHEMA_RE.fullmatch(schema):
                raise BackupError("refusing to dump a schema whose name failed validation")
            args += ["--schema", schema]
        if snapshot:
            args += ["--snapshot", snapshot]
        self._execute("pg_dump", args, what=f"pg_dump {schema or self.conn.dbname}", stdout_path=out)
        if out.stat().st_size == 0:
            raise BackupError("pg_dump produced an empty dump")

    def dump_globals(self, out: Path) -> None:
        self._execute("pg_dumpall", ["--globals-only", "--no-role-passwords"], what="pg_dumpall", stdout_path=out)

    def restore_database(self, dump: Path, *, schema: str | None = None) -> None:
        args = ["-d", self.conn.dbname, "--no-owner", "--clean", "--if-exists", "--single-transaction"]
        args.append("--exit-on-error")
        if schema is not None:
            if not _SCHEMA_RE.fullmatch(schema):
                raise BackupError("refusing to restore a schema whose name failed validation")
            args += ["--schema", schema]
        self._execute("pg_restore", args, what=f"pg_restore {schema or self.conn.dbname}", stdin_path=dump)


@contextlib.contextmanager
def _snapshot_session(conn: PgConnectionInfo) -> Iterator[tuple[Any, str | None]]:
    """Read-only REPEATABLE READ session that exports its snapshot so pg_dump sees the exact same data."""
    try:
        import psycopg2
    except ImportError as err:
        raise BackupError("psycopg2 is required for consistent tenant backups") from err
    pg = psycopg2.connect(
        host=conn.host,
        port=conn.port,
        user=conn.user,
        password=conn.password,
        dbname=conn.dbname,
        connect_timeout=20,
        application_name="oxengl-backup",
    )
    try:
        pg.set_session(isolation_level="REPEATABLE READ", readonly=True)
        snapshot: str | None = None
        with pg.cursor() as cur:
            try:
                cur.execute("SELECT pg_export_snapshot()")
                snapshot = cur.fetchone()[0]
            except psycopg2.Error as err:
                logger.warning(
                    "pg_export_snapshot unavailable (%s); dump and row export not co-snapshotted", type(err).__name__
                )
                pg.rollback()
        yield pg, snapshot
    finally:
        with contextlib.suppress(Exception):
            pg.rollback()
        pg.close()


def _resolve_tenant(cur: Any, tenant_id: uuid.UUID) -> tuple[str | None, bool]:
    """Return ``(schema_name, tenant_exists)`` from ``public.tenants`` / ``public.res_companies``."""
    tid = str(tenant_id)
    cur.execute("SELECT to_regclass('public.tenants') IS NOT NULL, to_regclass('public.res_companies') IS NOT NULL")
    has_tenants, has_companies = cur.fetchone()
    schema: str | None = None
    known = False
    if has_tenants:
        cur.execute("SELECT schema_name FROM public.tenants WHERE id::text = %s", (tid,))
        row = cur.fetchone()
        if row:
            known, schema = True, row[0]
    if has_companies:
        cur.execute("SELECT 1 FROM public.res_companies WHERE id::text = %s", (tid,))
        known = known or cur.fetchone() is not None
    return schema, known


def _export_shared_rows(pg: Any, tenant_id: uuid.UUID, out_dir: Path) -> list[tuple[str, Path]]:
    """COPY the tenant's rows out of every shared ``public`` table carrying tenant_id / company_id.

    Runs inside the snapshot session, so the rows are consistent with the schema dump. Any failure is
    fatal: a backup that silently misses a table is worse than a failed run that alerts.
    """
    from psycopg2 import sql

    tid = str(tenant_id)
    exported: list[tuple[str, Path]] = []
    with pg.cursor() as cur:
        # Mirror tenant_rls_scope() so FORCE ROW LEVEL SECURITY policies also admit the backup role.
        cur.execute(
            "SELECT set_config('app.current_tenant_id', %s, true), set_config('app.current_company_id', %s, true)",
            (tid, tid),
        )
        cur.execute(
            """
            SELECT c.relname, array_agg(a.attname::text ORDER BY a.attname)
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
              AND a.attname IN ('tenant_id', 'company_id')
            GROUP BY c.relname ORDER BY c.relname
            """
        )
        tables: dict[str, list[str]] = {name: list(cols) for name, cols in cur.fetchall()}
        for registry in ("res_companies", "tenants"):  # the tenant's own registry rows, keyed by id
            cur.execute("SELECT to_regclass(%s) IS NOT NULL", (f"public.{registry}",))
            if cur.fetchone()[0]:
                tables[registry] = ["id"]
        for table, columns in sorted(tables.items()):
            if not _TABLE_RE.fullmatch(table):
                raise BackupError(f"shared table name {table!r} failed validation; refusing partial export")
            condition = sql.SQL(" OR ").join(
                sql.SQL("{}::text = {}").format(sql.Identifier(col), sql.Literal(tid)) for col in columns
            )
            query = sql.SQL("COPY (SELECT * FROM {}.{} WHERE {}) TO STDOUT WITH (FORMAT csv, HEADER true)").format(
                sql.Identifier("public"), sql.Identifier(table), condition
            )
            target = out_dir / f"public.{table}.csv"
            with _open_private_write(target, exclusive=True) as fh:
                cur.copy_expert(query, fh)
            exported.append((table, target))
    return exported


# =============================================================================================
# Staging and packaging
# =============================================================================================


@dataclass
class StagedDatabaseFile:
    path: Path
    arcname: str
    meta: dict[str, Any]


@dataclass
class StagedBackup:
    """Database dumps written to a private staging dir + the asset roots to stream (not copied)."""

    backup_id: uuid.UUID
    scope: BackupScope
    kind: BackupKind
    tenant_id: uuid.UUID | None
    staging_dir: Path
    since: datetime | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    database_files: list[StagedDatabaseFile] = field(default_factory=list)
    asset_sources: list[AssetSource] = field(default_factory=list)
    manifest_extra: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def add_database_file(self, path: Path, arcname: str, **meta: Any) -> None:
        self.database_files.append(StagedDatabaseFile(path, safe_arcname(arcname), meta))

    def cleanup(self) -> None:
        shutil.rmtree(self.staging_dir, ignore_errors=True)


def artifact_name(scope: BackupScope, kind: BackupKind, created_at: datetime, backup_id: uuid.UUID) -> str:
    stamp = created_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"oxengl-{scope.value}-{kind.value}-{stamp}-{backup_id.hex[:8]}{ARCHIVE_SUFFIX}"


def select_for_deletion(names: Iterable[str], keep: int, *, scope: BackupScope, kind: BackupKind) -> list[str]:
    """Archives of exactly this scope/kind beyond the newest ``keep``. Foreign files are never selected."""
    if keep < 1:
        raise ValueError("retention must keep at least one archive")
    ours: list[tuple[str, str]] = []
    for name in names:
        match = _ARTIFACT_NAME_RE.fullmatch(name)
        if match and match.group(1) == scope.value and match.group(2) == kind.value:
            ours.append((match.group(3), name))
    ours.sort(reverse=True)
    return [name for _, name in ours[keep:]]


# =============================================================================================
# Credentials
# =============================================================================================


class CredentialProvider(Protocol):
    def get(self, ref: str) -> Mapping[str, str]:
        """Return the secret blob stored under ``ref``."""
        ...

    def update(self, ref: str, values: Mapping[str, str]) -> None:
        """Persist rotated secrets (e.g. a new OAuth2 refresh token)."""
        ...


class EnvCredentialProvider:
    """Reads ``OXENGL_BACKUP_CRED_<REF>`` (JSON object of strings). For development / container secrets;
    production wires a vault-backed provider that encrypts at rest and can persist rotated tokens."""

    @staticmethod
    def _var(ref: str) -> str:
        if not _CRED_REF_RE.fullmatch(ref):
            raise BackupError("invalid credential reference")
        return "OXENGL_BACKUP_CRED_" + re.sub(r"[^A-Z0-9]", "_", ref.upper())

    def get(self, ref: str) -> Mapping[str, str]:
        raw = os.getenv(self._var(ref))
        if not raw:
            raise BackupError(f"credential reference {ref!r} is not configured")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as err:
            raise BackupError(f"credential reference {ref!r} is not valid JSON") from err
        if not isinstance(data, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in data.items()):
            raise BackupError(f"credential reference {ref!r} must be a JSON object of strings")
        return data

    def update(self, ref: str, values: Mapping[str, str]) -> None:
        logger.warning(
            "credentials for %s were rotated by the provider but cannot be persisted by EnvCredentialProvider; "
            "update the secret store",
            ref,
        )


# =============================================================================================
# Destination connectors
# =============================================================================================


def _tls_verify(config: DestinationConfig) -> ssl.SSLContext | bool:
    ca_bundle = config.options.get("ca_bundle")
    if not ca_bundle:
        return True
    if not Path(ca_bundle).is_file():
        raise BackupError("configured ca_bundle does not exist")
    return ssl.create_default_context(cafile=ca_bundle)


def _parse_xml(content: bytes) -> ET.Element:
    if b"<!DOCTYPE" in content or b"<!ENTITY" in content:
        raise BackupError("refusing XML response containing a DTD")  # entity-expansion guard
    return ET.fromstring(content)


def _xml_local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _xml_iter(root: ET.Element, name: str) -> Iterator[ET.Element]:
    return (el for el in root.iter() if _xml_local(el.tag) == name)


def _xml_child_text(element: ET.Element, name: str) -> str | None:
    for child in element:
        if _xml_local(child.tag) == name:
            return child.text
    return None


def _remote_error_code(response: httpx.Response) -> str:
    code: Any = None
    try:
        content_type = response.headers.get("content-type", "")
        if "json" in content_type:
            err = response.json().get("error")
            code = (err.get("status") or err.get("code")) if isinstance(err, dict) else err
        elif "xml" in content_type:
            code = next((el.text for el in _xml_iter(_parse_xml(response.content), "Code")), None)
    except Exception:  # noqa: BLE001 - best-effort diagnostics only
        return ""
    return f" ({str(code)[:80]})" if code else ""


def _expect(response: httpx.Response, ok: tuple[int, ...], what: str) -> httpx.Response:
    if response.status_code not in ok:
        raise BackupError(f"{what} failed with HTTP {response.status_code}{_remote_error_code(response)}")
    return response


def _stream_to_file(response: httpx.Response, local: Path, what: str) -> None:
    if response.status_code != 200:
        response.read()
        _expect(response, (200,), what)
    with _open_private_write(local) as fh:
        for chunk in response.iter_bytes(_COPY_BUFSIZE):
            fh.write(chunk)


class BackupDestination(abc.ABC):
    """Uploads an already-encrypted artifact to one destination (template method over protocol primitives)."""

    type: ClassVar[DestinationType]

    def __init__(self, config: DestinationConfig, credentials: CredentialProvider | None = None) -> None:
        if config.type is not self.type:
            raise ValueError(f"{type(self).__name__} cannot handle destination type {config.type.value}")
        _assert_safe_remote(confine_remote_path(config.base_path))
        self.config = config
        self.credentials: CredentialProvider = credentials or EnvCredentialProvider()
        self.timeout = float(config.options.get("timeout", _DEFAULT_TIMEOUT_S))
        self.transfer_timeout = float(config.options.get("transfer_timeout", _DEFAULT_TRANSFER_TIMEOUT_S))
        self._secret_cache: dict[str, str] | None = None

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        """Release network resources (HTTP clients). Connectors without clients keep this no-op."""

    # ---- secrets -----------------------------------------------------------------------------------
    def _secrets(self) -> dict[str, str]:
        if self._secret_cache is None:
            ref = self.config.credential_ref
            self._secret_cache = dict(self.credentials.get(ref)) if ref else {}
        return self._secret_cache

    def _secret(self, name: str, *, required: bool = True) -> str | None:
        value = self._secrets().get(name)
        if required and not value:
            raise BackupError(f"destination {self.config.name!r} credential is missing {name!r}")
        return value

    # ---- path layout -------------------------------------------------------------------------------
    @staticmethod
    def scope_dirname(scope: BackupScope, tenant_id: uuid.UUID | None) -> str:
        if scope is BackupScope.TENANT:
            if tenant_id is None:
                raise ValueError("tenant scope requires a tenant_id")
            return f"tenant-{uuid.UUID(str(tenant_id))}"
        return "platform"

    def confine(self, *parts: str) -> str:
        return _assert_safe_remote(confine_remote_path(self.config.base_path, *parts))

    def remote_path_for(self, artifact: BackupArtifact) -> str:
        scope_dir = self.scope_dirname(artifact.scope, artifact.tenant_id)
        return self.confine(scope_dir, artifact.kind.value, artifact.path.name)

    def _confine_existing(self, remote_path: str) -> str:
        base = confine_remote_path(self.config.base_path)
        normalised = confine_remote_path("/", remote_path)
        if normalised != base and not normalised.startswith(base.rstrip("/") + "/"):
            raise PathTraversalError("remote path lies outside the destination base path")
        return _assert_safe_remote(normalised)

    # ---- protocol primitives -----------------------------------------------------------------------
    @abc.abstractmethod
    def test_connection(self) -> None:
        """Raise on failure (bad credentials, unknown host key, missing bucket / folder...)."""

    @abc.abstractmethod
    def _ensure_dir(self, remote_dir: str) -> None:
        """Create ``remote_dir`` (and parents) if the protocol has directories."""

    @abc.abstractmethod
    def _put(self, local: Path, remote: str) -> None:
        """Upload so that ``remote`` only appears once complete (temp name + rename where supported)."""

    @abc.abstractmethod
    def _remote_size(self, remote: str) -> int | None:
        """Size of ``remote`` in bytes, ``None`` if it does not exist."""

    @abc.abstractmethod
    def _list(self, remote_dir: str) -> list[str]:
        """Entry names in ``remote_dir``; empty list when it does not exist."""

    @abc.abstractmethod
    def _delete(self, remote: str) -> None:
        """Delete ``remote``; deleting a missing object is not an error."""

    @abc.abstractmethod
    def _get(self, remote: str, local: Path) -> None:
        """Download ``remote`` to ``local``."""

    def _remote_sha256(self, remote: str) -> str | None:
        """Server-side SHA-256 when the protocol can compute one; ``None`` -> size verification only."""
        return None

    # ---- high-level operations ---------------------------------------------------------------------
    def upload(self, artifact: BackupArtifact) -> UploadResult:
        """Upload ``artifact`` (+ checksum sidecar) and verify the remote copy afterwards."""
        remote = self.remote_path_for(artifact)
        self._ensure_dir(posixpath.dirname(remote))
        self._put(artifact.path, remote)
        remote_size = self._remote_size(remote)
        if remote_size != artifact.size_bytes:
            raise BackupIntegrityError(
                f"remote size mismatch on {self.config.name!r}: expected {artifact.size_bytes}, got {remote_size}"
            )
        verified = "size"
        remote_sha = self._remote_sha256(remote)
        if remote_sha is not None:
            if not hmac.compare_digest(remote_sha, artifact.sha256):
                raise BackupIntegrityError(f"remote SHA-256 mismatch on {self.config.name!r}")
            verified = "size+sha256"
        if artifact.checksum_path is not None:
            self._put(artifact.checksum_path, remote + CHECKSUM_SUFFIX)
        return UploadResult(destination_id=self.config.id, ok=True, remote_path=remote, verified=verified)

    def prune(self, scope: BackupScope, tenant_id: uuid.UUID | None, keep_daily: int, keep_weekly: int) -> int:
        """Apply retention under this scope's prefix only; return the number of archives removed."""
        removed = 0
        scope_dir = self.scope_dirname(scope, tenant_id)
        for kind, keep in ((BackupKind.INCREMENTAL, keep_daily), (BackupKind.FULL, keep_weekly)):
            names = set(self._list(self.confine(scope_dir, kind.value)))
            for name in select_for_deletion(names, keep, scope=scope, kind=kind):
                self._delete(self.confine(scope_dir, kind.value, name))
                removed += 1
                if name + CHECKSUM_SUFFIX in names:
                    self._delete(self.confine(scope_dir, kind.value, name + CHECKSUM_SUFFIX))
        return removed

    def download(self, remote_path: str, local_dir: Path) -> Path:
        remote = self._confine_existing(remote_path)
        name = posixpath.basename(remote)
        if not name:
            raise PathTraversalError("remote path does not name a file")
        local = ensure_within(local_dir, local_dir / name)
        self._get(remote, local)
        return local


# ---- SSH family (OpenSSH client, pinned host key) ----------------------------------------------------


class _SSHMixin:
    """Shared SSH plumbing: pinned known_hosts + identity written to a private temp dir per operation."""

    config: DestinationConfig
    timeout: float
    transfer_timeout: float
    _secret: Callable[..., str | None]

    def _ssh_target(self) -> tuple[str, str, int]:
        host = self.config.host or ""
        user = self.config.username or ""
        if not _HOST_RE.fullmatch(host):
            raise BackupError("SSH destination requires a valid host")
        if not _USER_RE.fullmatch(user):
            raise BackupError("SSH destination requires a valid username")
        port = int(self.config.port or 22)
        if not 0 < port < 65536:
            raise BackupError("SSH destination port out of range")
        return host, user, port

    @contextlib.contextmanager
    def _ssh_options(self) -> Iterator[list[str]]:
        pinned = (self.config.pinned_host_key or "").strip()
        if not _HOST_KEY_RE.fullmatch(pinned):
            raise BackupError(
                "SSH destinations require pinned_host_key '<type> <base64>'; host keys are never auto-accepted"
            )
        private_key = self._secret("private_key") or ""
        with tempfile.TemporaryDirectory(prefix="oxengl-ssh-") as tmp:
            known_hosts = Path(tmp) / "known_hosts"
            identity = Path(tmp) / "identity"
            _write_private(known_hosts, f"{_SSH_HOST_ALIAS} {pinned}\n".encode())
            _write_private(identity, (private_key if private_key.endswith("\n") else private_key + "\n").encode())
            yield [
                "-F", "/dev/null",
                "-o", "BatchMode=yes",
                "-o", "StrictHostKeyChecking=yes",
                "-o", f"UserKnownHostsFile={known_hosts}",
                "-o", "GlobalKnownHostsFile=/dev/null",
                "-o", f"HostKeyAlias={_SSH_HOST_ALIAS}",
                "-o", "IdentitiesOnly=yes",
                "-o", "IdentityAgent=none",
                "-o", "ConnectTimeout=20",
                "-o", "ServerAliveInterval=15",
                "-o", "ServerAliveCountMax=4",
                "-o", "LogLevel=ERROR",
                "-i", str(identity),
            ]  # fmt: skip


class SFTPDestination(_SSHMixin, BackupDestination):
    """Private server over SFTP (OpenSSH ``sftp -b``). Host key MUST match ``pinned_host_key``."""

    type = DestinationType.SFTP

    def _batch(self, commands: list[str], *, what: str) -> list[str]:
        host, user, port = self._ssh_target()
        with self._ssh_options() as opts:
            proc = _run(
                ["sftp", "-b", "-", *opts, "-P", str(port), f"{user}@{host}"],
                what=f"sftp {what}",
                timeout=self.transfer_timeout,
                env=_child_env(),
                input_bytes=("\n".join(commands) + "\n").encode(),
            )
        lines = proc.stdout.decode("utf-8", "replace").splitlines()
        return [line for line in lines if line.strip() and not line.startswith("sftp>")]

    def test_connection(self) -> None:
        self._batch(["pwd"], what="connect")
        self._ensure_dir(confine_remote_path(self.config.base_path))

    def _ensure_dir(self, remote_dir: str) -> None:
        _assert_safe_remote(remote_dir)
        self._batch([f'-mkdir "{prefix}"' for prefix in _path_prefixes(remote_dir)], what="mkdir")

    def _put(self, local: Path, remote: str) -> None:
        source = _assert_safe_local(local)
        part = _assert_safe_remote(remote + ".part")
        self._batch(
            [
                f'-rm "{part}"',
                f'put "{source}" "{part}"',
                f'chmod 600 "{part}"',
                f'-rm "{remote}"',
                f'rename "{part}" "{remote}"',
            ],
            what="upload",
        )

    def _remote_size(self, remote: str) -> int | None:
        name = posixpath.basename(remote)
        for line in self._batch([f'-ls -ln "{remote}"'], what="stat"):
            fields = line.split()
            if len(fields) >= 9 and fields[-1].endswith(name) and fields[4].isdigit():
                return int(fields[4])
        return None

    def _list(self, remote_dir: str) -> list[str]:
        return [posixpath.basename(line.strip()) for line in self._batch([f'-ls -1 "{remote_dir}"'], what="list")]

    def _delete(self, remote: str) -> None:
        self._batch([f'rm "{remote}"'], what="delete")

    def _get(self, remote: str, local: Path) -> None:
        self._batch([f'get "{remote}" "{_assert_safe_local(local)}"'], what="download")


class RsyncSSHDestination(_SSHMixin, BackupDestination):
    """Private server via rsync over SSH (StrictHostKeyChecking=yes, pinned known_hosts). The remote account
    needs a POSIX shell (mkdir, wc, ls, rm, sha256sum|shasum) in addition to rsync."""

    type = DestinationType.RSYNC_SSH

    def _remote_spec(self, remote: str) -> str:
        host, user, _ = self._ssh_target()
        return f"{user}@[{host}]:{remote}" if ":" in host else f"{user}@{host}:{remote}"

    def _ssh(self, command: str, *, what: str) -> str:
        host, user, port = self._ssh_target()
        with self._ssh_options() as opts:
            proc = _run(
                ["ssh", *opts, "-p", str(port), f"{user}@{host}", command],
                what=f"ssh {what}",
                timeout=self.transfer_timeout,
                env=_child_env(),
            )
        return proc.stdout.decode("utf-8", "replace")

    def _rsync(self, source: str, target: str, *, what: str) -> None:
        _, _, port = self._ssh_target()
        with self._ssh_options() as opts:
            rsh = shlex.join(["ssh", *opts, "-p", str(port)])
            _run(
                [
                    "rsync", "--protect-args", "--partial", "--partial-dir=.rsync-partial", "--chmod=F600",
                    f"--timeout={int(self.timeout)}", "-e", rsh, source, target,
                ],
                what=f"rsync {what}",
                timeout=self.transfer_timeout,
                env=_child_env(),
            )  # fmt: skip

    def test_connection(self) -> None:
        base = shlex.quote(confine_remote_path(self.config.base_path))
        self._ssh(f"mkdir -p -m 700 -- {base} && test -w {base}", what="connect")

    def _ensure_dir(self, remote_dir: str) -> None:
        self._ssh(f"mkdir -p -m 700 -- {shlex.quote(_assert_safe_remote(remote_dir))}", what="mkdir")

    def _put(self, local: Path, remote: str) -> None:
        self._rsync(str(local), self._remote_spec(_assert_safe_remote(remote)), what="upload")

    def _remote_size(self, remote: str) -> int | None:
        out = self._ssh(f"wc -c < {shlex.quote(remote)} 2>/dev/null || true", what="stat").strip()
        return int(out) if out.isdigit() else None

    def _remote_sha256(self, remote: str) -> str | None:
        quoted = shlex.quote(remote)
        out = self._ssh(
            f"(sha256sum -- {quoted} 2>/dev/null || shasum -a 256 -- {quoted} 2>/dev/null) | cut -d' ' -f1",
            what="checksum",
        )
        digest = out.strip().lower()
        return digest if _SHA256_HEX_RE.fullmatch(digest) else None

    def _list(self, remote_dir: str) -> list[str]:
        out = self._ssh(f"ls -1A -- {shlex.quote(remote_dir)} 2>/dev/null || true", what="list")
        return [line for line in out.splitlines() if line]

    def _delete(self, remote: str) -> None:
        self._ssh(f"rm -f -- {shlex.quote(remote)}", what="delete")

    def _get(self, remote: str, local: Path) -> None:
        self._rsync(self._remote_spec(remote), str(local), what="download")


# ---- WebDAV ------------------------------------------------------------------------------------------

_PROPFIND_BODY = (
    b'<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop>'
    b"<d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>"
)


class WebDAVDestination(BackupDestination):
    """Private server / NAS over WebDAV (HTTPS only, basic auth). Upload to ``.part`` then MOVE."""

    type = DestinationType.WEBDAV

    def __init__(self, config: DestinationConfig, credentials: CredentialProvider | None = None) -> None:
        super().__init__(config, credentials)
        self._client: httpx.Client | None = None

    def _base_url(self) -> str:
        url = self.config.options.get("url")
        if not url:
            host = self.config.host or ""
            if not _HOST_RE.fullmatch(host):
                raise BackupError("WebDAV destination requires options.url or a valid host")
            url = f"https://{host}" + (f":{int(self.config.port)}" if self.config.port else "")
        parts = urlsplit(url)
        if parts.scheme != "https" or not parts.netloc or "@" in parts.netloc or parts.query or parts.fragment:
            raise BackupError("WebDAV destinations require a plain https:// URL")
        return url.rstrip("/")

    def _http(self) -> httpx.Client:
        if self._client is None:
            username = self.config.username or self._secret("username") or ""
            password = self._secret("password") or ""
            self._client = httpx.Client(
                auth=httpx.BasicAuth(username, password),
                verify=_tls_verify(self.config),
                timeout=httpx.Timeout(self.timeout),
                follow_redirects=False,
            )
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    def _url(self, remote: str) -> str:
        return self._base_url() + quote(remote, safe="/")

    def _propfind(self, remote: str, depth: str) -> httpx.Response:
        return self._http().request(
            "PROPFIND",
            self._url(remote),
            content=_PROPFIND_BODY,
            headers={"Depth": depth, "Content-Type": "application/xml"},
        )

    def test_connection(self) -> None:
        self._ensure_dir(confine_remote_path(self.config.base_path))

    def _ensure_dir(self, remote_dir: str) -> None:
        for prefix in _path_prefixes(_assert_safe_remote(remote_dir)):
            response = self._http().request("MKCOL", self._url(prefix + "/"))
            if response.status_code in (201, 405):  # 405: collection already exists
                continue
            if self._propfind(prefix + "/", "0").status_code == 207:
                continue  # exists, but MKCOL is not permitted at this level
            _expect(response, (201,), "WebDAV MKCOL")

    def _put(self, local: Path, remote: str) -> None:
        part = remote + ".part"
        with open(local, "rb") as fh:  # file object -> httpx streams it with a Content-Length header
            response = self._http().put(self._url(part), content=fh, headers={"Content-Type": "application/octet-stream"})
            _expect(response, (200, 201, 204), "WebDAV PUT")
        moved = self._http().request(
            "MOVE", self._url(part), headers={"Destination": self._url(remote), "Overwrite": "T"}
        )
        _expect(moved, (201, 204), "WebDAV MOVE")

    def _remote_size(self, remote: str) -> int | None:
        response = self._propfind(remote, "0")
        if response.status_code == 404:
            return None
        _expect(response, (207,), "WebDAV PROPFIND")
        for element in _xml_iter(_parse_xml(response.content), "getcontentlength"):
            if element.text and element.text.strip().isdigit():
                return int(element.text.strip())
        return None

    def _list(self, remote_dir: str) -> list[str]:
        response = self._propfind(remote_dir.rstrip("/") + "/", "1")
        if response.status_code == 404:
            return []
        _expect(response, (207,), "WebDAV PROPFIND")
        own = posixpath.basename(remote_dir.rstrip("/"))
        names = []
        for href in _xml_iter(_parse_xml(response.content), "href"):
            name = posixpath.basename(unquote(urlsplit(href.text or "").path).rstrip("/"))
            if name and name != own:
                names.append(name)
        return names

    def _delete(self, remote: str) -> None:
        _expect(self._http().delete(self._url(remote)), (200, 204, 404), "WebDAV DELETE")

    def _get(self, remote: str, local: Path) -> None:
        with self._http().stream("GET", self._url(remote)) as response:
            _stream_to_file(response, local, "WebDAV GET")


# ---- S3-compatible (MinIO etc.) - AWS Signature V4, path-style addressing ------------------------------


def _aws_quote(value: str) -> str:
    return quote(value, safe="-_.~")


class S3CompatibleDestination(BackupDestination):
    """Private S3-compatible object storage (MinIO on-prem / private VPS) over HTTPS with SigV4.

    Every request body is signed with its SHA-256 (no UNSIGNED-PAYLOAD), so the server verifies the
    integrity of each part; large archives use multipart upload (aborted on failure).
    """

    type = DestinationType.S3_COMPATIBLE

    def __init__(self, config: DestinationConfig, credentials: CredentialProvider | None = None) -> None:
        super().__init__(config, credentials)
        self._client: httpx.Client | None = None

    def _endpoint(self) -> str:
        endpoint = self.config.options.get("endpoint")
        if not endpoint:
            host = self.config.host or ""
            if not _HOST_RE.fullmatch(host):
                raise BackupError("S3 destination requires options.endpoint or a valid host")
            endpoint = f"https://{host}" + (f":{int(self.config.port)}" if self.config.port else "")
        parts = urlsplit(endpoint)
        if (
            parts.scheme != "https"
            or not parts.netloc
            or "@" in parts.netloc
            or parts.path not in ("", "/")
            or parts.query
        ):
            raise BackupError("S3-compatible destinations require an https:// endpoint without a path")
        return f"https://{parts.netloc}"

    def _bucket(self) -> str:
        bucket = self.config.bucket or ""
        if not _BUCKET_RE.fullmatch(bucket):
            raise BackupError("S3 destination requires a valid bucket name")
        return bucket

    def _region(self) -> str:
        region = self.config.options.get("region", "us-east-1")
        if not _REGION_RE.fullmatch(region):
            raise BackupError("invalid S3 region")
        return region

    def _part_size(self) -> int:
        return max(5, int(self.config.options.get("part_size_mb", "64"))) * 1024 * 1024

    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                verify=_tls_verify(self.config), timeout=httpx.Timeout(self.timeout), follow_redirects=False
            )
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    def _request(
        self,
        method: str,
        key: str | None,
        *,
        query: Mapping[str, str] | None = None,
        body: bytes = b"",
        headers: Mapping[str, str] | None = None,
        stream: bool = False,
    ) -> httpx.Response:
        access_key = self._secret("access_key_id") or ""
        secret_key = self._secret("secret_access_key") or ""
        region = self._region()
        endpoint = self._endpoint()
        # Keys are restricted to [A-Za-z0-9._/-] (see _assert_safe_remote): no URI encoding required.
        path = "/" + self._bucket() + ("/" + _assert_safe_remote("/" + key)[1:] if key else "")
        canonical_query = "&".join(f"{_aws_quote(k)}={_aws_quote(v)}" for k, v in sorted((query or {}).items()))
        payload_hash = hashlib.sha256(body).hexdigest()
        amz_date = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        day = amz_date[:8]
        signed: dict[str, str] = {
            "host": urlsplit(endpoint).netloc,
            "x-amz-date": amz_date,
            "x-amz-content-sha256": payload_hash,
        }
        token = self._secret("session_token", required=False)
        if token:
            signed["x-amz-security-token"] = token
        for name, value in (headers or {}).items():
            signed[name.lower()] = value.strip()
        signed_names = ";".join(sorted(signed))
        canonical_headers = "".join(f"{name}:{signed[name]}\n" for name in sorted(signed))
        canonical_request = f"{method}\n{path}\n{canonical_query}\n{canonical_headers}\n{signed_names}\n{payload_hash}"
        credential_scope = f"{day}/{region}/s3/aws4_request"
        string_to_sign = "\n".join(
            ["AWS4-HMAC-SHA256", amz_date, credential_scope, hashlib.sha256(canonical_request.encode()).hexdigest()]
        )
        signing_key = ("AWS4" + secret_key).encode()
        for part in (day, region, "s3", "aws4_request"):
            signing_key = hmac.new(signing_key, part.encode(), hashlib.sha256).digest()
        signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()
        signed["authorization"] = (
            f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
            f"SignedHeaders={signed_names}, Signature={signature}"
        )
        url = endpoint + path + (f"?{canonical_query}" if canonical_query else "")
        request = self._http().build_request(method, url, content=body or None, headers=signed)
        return self._http().send(request, stream=stream)

    def _object_headers(self) -> dict[str, str]:
        sse = self.config.options.get("sse", "")
        return {"x-amz-server-side-encryption": sse} if sse == "AES256" else {}

    def test_connection(self) -> None:
        _expect(self._request("HEAD", None), (200,), "S3 HeadBucket")

    def _ensure_dir(self, remote_dir: str) -> None:
        """Object storage has no directories."""

    def _put(self, local: Path, remote: str) -> None:
        key = remote.lstrip("/")
        size = local.stat().st_size
        part_size = self._part_size()
        headers = {**self._object_headers(), "content-type": "application/octet-stream"}
        if size <= part_size:
            _expect(self._request("PUT", key, body=local.read_bytes(), headers=headers), (200,), "S3 PutObject")
            return
        if -(-size // part_size) > 10_000:
            raise BackupError("archive needs more than 10,000 multipart parts; increase options.part_size_mb")
        created = _expect(
            self._request("POST", key, query={"uploads": ""}, headers=headers), (200,), "S3 CreateMultipartUpload"
        )
        upload_id = next((el.text for el in _xml_iter(_parse_xml(created.content), "UploadId")), None)
        if not upload_id:
            raise BackupError("S3 CreateMultipartUpload returned no UploadId")
        parts: list[tuple[int, str]] = []
        try:
            with open(local, "rb") as fh:
                number = 1
                while chunk := fh.read(part_size):
                    response = _expect(
                        self._request("PUT", key, query={"partNumber": str(number), "uploadId": upload_id}, body=chunk),
                        (200,),
                        "S3 UploadPart",
                    )
                    etag = response.headers.get("ETag")
                    if not etag:
                        raise BackupError("S3 UploadPart returned no ETag")
                    parts.append((number, etag))
                    number += 1
            body = (
                "<CompleteMultipartUpload>"
                + "".join(f"<Part><PartNumber>{n}</PartNumber><ETag>{xml_escape(e)}</ETag></Part>" for n, e in parts)
                + "</CompleteMultipartUpload>"
            ).encode()
            done = _expect(
                self._request(
                    "POST", key, query={"uploadId": upload_id}, body=body, headers={"content-type": "application/xml"}
                ),
                (200,),
                "S3 CompleteMultipartUpload",
            )
            if b"<Error>" in done.content:  # S3 may report failure inside a 200 response
                raise BackupError("S3 CompleteMultipartUpload reported an error")
        except BaseException:
            with contextlib.suppress(Exception):
                self._request("DELETE", key, query={"uploadId": upload_id})
            raise

    def _remote_size(self, remote: str) -> int | None:
        response = self._request("HEAD", remote.lstrip("/"))
        if response.status_code == 404:
            return None
        _expect(response, (200,), "S3 HeadObject")
        length = response.headers.get("content-length", "")
        return int(length) if length.isdigit() else None

    def _list(self, remote_dir: str) -> list[str]:
        prefix = remote_dir.strip("/") + "/"
        names: list[str] = []
        token: str | None = None
        while True:
            query = {"list-type": "2", "prefix": prefix, "delimiter": "/"}
            if token:
                query["continuation-token"] = token
            root = _parse_xml(_expect(self._request("GET", None, query=query), (200,), "S3 ListObjectsV2").content)
            for contents in _xml_iter(root, "Contents"):
                key = _xml_child_text(contents, "Key")
                if key:
                    names.append(posixpath.basename(key))
            truncated = (_xml_child_text(root, "IsTruncated") or "").lower() == "true"
            token = _xml_child_text(root, "NextContinuationToken")
            if not truncated or not token:
                return names

    def _delete(self, remote: str) -> None:
        _expect(self._request("DELETE", remote.lstrip("/")), (200, 204, 404), "S3 DeleteObject")

    def _get(self, remote: str, local: Path) -> None:
        response = self._request("GET", remote.lstrip("/"), stream=True)
        try:
            _stream_to_file(response, local, "S3 GetObject")
        finally:
            response.close()


# ---- OAuth2 cloud connectors ---------------------------------------------------------------------------


class _OAuth2RefreshSession:
    """Access-token cache over the OAuth2 refresh-token grant; persists rotated refresh tokens."""

    def __init__(
        self,
        http: httpx.Client,
        *,
        token_url: str,
        client_id: str,
        client_secret: str | None,
        refresh_token: str,
        scope: str | None,
        on_rotate: Callable[[str], None],
    ) -> None:
        self._http = http
        self._token_url = token_url
        self._client_id = client_id
        self._client_secret = client_secret
        self._refresh_token = refresh_token
        self._scope = scope
        self._on_rotate = on_rotate
        self._access_token: str | None = None
        self._expires_at = 0.0

    def invalidate(self) -> None:
        self._access_token = None

    def headers(self) -> dict[str, str]:
        if self._access_token is None or time.monotonic() >= self._expires_at - 60:
            data = {"grant_type": "refresh_token", "refresh_token": self._refresh_token, "client_id": self._client_id}
            if self._client_secret:
                data["client_secret"] = self._client_secret
            if self._scope:
                data["scope"] = self._scope
            payload = _expect(self._http.post(self._token_url, data=data), (200,), "OAuth2 token refresh").json()
            token = payload.get("access_token")
            if not isinstance(token, str) or not token:
                raise BackupError("OAuth2 token endpoint returned no access_token")
            self._access_token = token
            self._expires_at = time.monotonic() + int(payload.get("expires_in", 3600))
            rotated = payload.get("refresh_token")
            if isinstance(rotated, str) and rotated and rotated != self._refresh_token:
                self._refresh_token = rotated
                self._on_rotate(rotated)
        return {"Authorization": f"Bearer {self._access_token}"}


class _OAuthDestination(BackupDestination):
    token_url: ClassVar[str] = ""
    oauth_scope: ClassVar[str | None] = None
    client_secret_required: ClassVar[bool] = True

    def __init__(self, config: DestinationConfig, credentials: CredentialProvider | None = None) -> None:
        super().__init__(config, credentials)
        self._client: httpx.Client | None = None
        self._session: _OAuth2RefreshSession | None = None

    def _token_url(self) -> str:
        return self.token_url

    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=httpx.Timeout(self.timeout), follow_redirects=False)
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    def _rotate(self, refresh_token: str) -> None:
        secrets = self._secrets()
        secrets["refresh_token"] = refresh_token
        if self.config.credential_ref:
            self.credentials.update(self.config.credential_ref, dict(secrets))

    def _oauth(self) -> _OAuth2RefreshSession:
        if self._session is None:
            self._session = _OAuth2RefreshSession(
                self._http(),
                token_url=self._token_url(),
                client_id=self._secret("client_id") or "",
                client_secret=self._secret("client_secret", required=self.client_secret_required),
                refresh_token=self._secret("refresh_token") or "",
                scope=self.oauth_scope,
                on_rotate=self._rotate,
            )
        return self._session

    def _authed(
        self, method: str, url: str, *, headers: Mapping[str, str] | None = None, **kwargs: Any
    ) -> httpx.Response:
        response = self._http().request(method, url, headers={**(headers or {}), **self._oauth().headers()}, **kwargs)
        if response.status_code == 401:  # token revoked / expired early: refresh once and retry
            self._oauth().invalidate()
            response = self._http().request(
                method, url, headers={**(headers or {}), **self._oauth().headers()}, **kwargs
            )
        return response


_GDRIVE_API = "https://www.googleapis.com/drive/v3"
_GDRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
_GDRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"
_GDRIVE_CHUNK = 8 * 1024 * 1024  # multiple of 256 KiB, as required for resumable uploads


class GoogleDriveDestination(_OAuthDestination):
    """Google Drive via OAuth2 (drive.file scope only; refresh token held in the encrypted vault).

    The remote path maps onto a folder hierarchy under ``options.folder_id`` (default: My Drive root).
    Uploads use resumable sessions; a file only becomes visible once its final chunk is committed.
    """

    type = DestinationType.GOOGLE_DRIVE
    token_url = "https://oauth2.googleapis.com/token"

    def __init__(self, config: DestinationConfig, credentials: CredentialProvider | None = None) -> None:
        super().__init__(config, credentials)
        self._folders: dict[str, str] = {}

    def _root_folder(self) -> str:
        folder = self.config.options.get("folder_id", "root")
        if not _DRIVE_ID_RE.fullmatch(folder):
            raise BackupError("invalid Google Drive folder_id")
        return folder

    def _find(self, name: str, parent: str, *, folder: bool) -> dict[str, Any] | None:
        # name / parent are restricted to [A-Za-z0-9._-] so they cannot break out of the query literal.
        op = "=" if folder else "!="
        query = f"name = '{name}' and '{parent}' in parents and trashed = false and mimeType {op} '{_GDRIVE_FOLDER_MIME}'"
        params = {"q": query, "fields": "files(id,name,size)", "pageSize": "10", "spaces": "drive"}
        response = _expect(self._authed("GET", f"{_GDRIVE_API}/files", params=params), (200,), "Google Drive list")
        files = response.json().get("files") or []
        return files[0] if files else None

    def _folder_id(self, remote_dir: str, *, create: bool) -> str | None:
        current = self._root_folder()
        path = ""
        for segment in [s for s in _assert_safe_remote(remote_dir).split("/") if s]:
            path += "/" + segment
            if path in self._folders:
                current = self._folders[path]
                continue
            found = self._find(segment, current, folder=True)
            if found is None:
                if not create:
                    return None
                body = {"name": segment, "mimeType": _GDRIVE_FOLDER_MIME, "parents": [current]}
                created = self._authed("POST", f"{_GDRIVE_API}/files", params={"fields": "id"}, json=body)
                found = _expect(created, (200,), "Google Drive folder create").json()
            current = str(found["id"])
            self._folders[path] = current
        return current

    def _file(self, remote: str) -> dict[str, Any] | None:
        folder = self._folder_id(posixpath.dirname(remote), create=False)
        return self._find(posixpath.basename(remote), folder, folder=False) if folder else None

    def test_connection(self) -> None:
        about = self._authed("GET", f"{_GDRIVE_API}/about", params={"fields": "user(emailAddress)"})
        _expect(about, (200,), "Google Drive about")
        self._ensure_dir(confine_remote_path(self.config.base_path))

    def _ensure_dir(self, remote_dir: str) -> None:
        self._folder_id(remote_dir, create=True)

    def _put(self, local: Path, remote: str) -> None:
        folder = self._folder_id(posixpath.dirname(remote), create=True) or ""
        name = posixpath.basename(remote)
        previous = self._find(name, folder, folder=False)
        size = local.stat().st_size
        started = _expect(
            self._authed(
                "POST",
                _GDRIVE_UPLOAD,
                params={"uploadType": "resumable", "fields": "id,size"},
                json={"name": name, "parents": [folder]},
                headers={"X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": str(size)},
            ),
            (200,),
            "Google Drive resumable session",
        )
        session_url = started.headers.get("Location", "")
        if not session_url.startswith("https://"):
            raise BackupError("Google Drive returned an invalid resumable session URL")
        offset, stalls, completed = 0, 0, False
        with open(local, "rb") as fh:
            while offset < size:
                fh.seek(offset)
                chunk = fh.read(_GDRIVE_CHUNK)
                end = offset + len(chunk) - 1
                headers = {**self._oauth().headers(), "Content-Range": f"bytes {offset}-{end}/{size}"}
                response = self._http().put(session_url, content=chunk, headers=headers)
                if response.status_code in (200, 201):
                    completed = True
                    break
                _expect(response, (308,), "Google Drive chunk upload")
                committed = response.headers.get("Range", "")  # e.g. "bytes=0-8388607"
                new_offset = int(committed.rsplit("-", 1)[1]) + 1 if committed else 0
                stalls = stalls + 1 if new_offset <= offset else 0
                if stalls >= 3:
                    raise BackupError("Google Drive resumable upload is not making progress")
                offset = new_offset
        if not completed:
            raise BackupError("Google Drive upload session ended without completion")
        if previous:  # replace semantics: delete the older copy only after the new one is committed
            self._authed("DELETE", f"{_GDRIVE_API}/files/{previous['id']}")

    def _remote_size(self, remote: str) -> int | None:
        found = self._file(remote)
        return int(found["size"]) if found and str(found.get("size", "")).isdigit() else None

    def _list(self, remote_dir: str) -> list[str]:
        folder = self._folder_id(remote_dir, create=False)
        if folder is None:
            return []
        names: list[str] = []
        page: str | None = None
        while True:
            params = {
                "q": f"'{folder}' in parents and trashed = false",
                "fields": "nextPageToken,files(name)",
                "pageSize": "1000",
                "spaces": "drive",
            }
            if page:
                params["pageToken"] = page
            response = self._authed("GET", f"{_GDRIVE_API}/files", params=params)
            payload = _expect(response, (200,), "Google Drive list").json()
            names += [str(f["name"]) for f in payload.get("files") or [] if f.get("name")]
            page = payload.get("nextPageToken")
            if not page:
                return names

    def _delete(self, remote: str) -> None:
        found = self._file(remote)
        if found:
            response = self._authed("DELETE", f"{_GDRIVE_API}/files/{found['id']}")
            _expect(response, (200, 204, 404), "Google Drive delete")

    def _get(self, remote: str, local: Path) -> None:
        found = self._file(remote)
        if not found:
            raise BackupError("archive not found on Google Drive")
        url = f"{_GDRIVE_API}/files/{found['id']}"
        with self._http().stream("GET", url, params={"alt": "media"}, headers=self._oauth().headers()) as response:
            _stream_to_file(response, local, "Google Drive download")


_GRAPH = "https://graph.microsoft.com/v1.0"
_ONEDRIVE_CHUNK = 320 * 1024 * 32  # 10 MiB; Graph upload sessions require multiples of 320 KiB


class OneDriveDestination(_OAuthDestination):
    """Microsoft OneDrive via Microsoft Graph OAuth2 (Files.ReadWrite.AppFolder; resumable upload sessions).

    Archives live in the app's special folder (``/me/drive/special/approot``) under ``base_path``.
    """

    type = DestinationType.ONEDRIVE
    oauth_scope = "Files.ReadWrite.AppFolder offline_access"
    client_secret_required = False  # public (PKCE) clients have no secret

    def __init__(self, config: DestinationConfig, credentials: CredentialProvider | None = None) -> None:
        super().__init__(config, credentials)
        self._known_dirs: set[str] = set()

    def _token_url(self) -> str:
        tenant = self.config.options.get("tenant", "common")
        if not _MS_TENANT_RE.fullmatch(tenant):
            raise BackupError("invalid Microsoft identity tenant")
        return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"

    @staticmethod
    def _item(remote: str) -> str:
        relative = remote.strip("/")
        root = f"{_GRAPH}/me/drive/special/approot"
        return root if not relative else f"{root}:/{quote(relative, safe='/')}:"

    def test_connection(self) -> None:
        _expect(self._authed("GET", self._item("/"), params={"$select": "id"}), (200,), "OneDrive approot")
        self._ensure_dir(confine_remote_path(self.config.base_path))

    def _ensure_dir(self, remote_dir: str) -> None:
        parent = ""
        for path in _path_prefixes(_assert_safe_remote(remote_dir)):
            if path not in self._known_dirs:
                response = self._authed("GET", self._item(path), params={"$select": "id,folder"})
                if response.status_code == 404:
                    children = (self._item(parent) if parent else self._item("/")) + "/children"
                    body = {"name": posixpath.basename(path), "folder": {}, "@microsoft.graph.conflictBehavior": "fail"}
                    created = self._authed("POST", children, json=body)
                    _expect(created, (200, 201, 409), "OneDrive folder create")  # 409: created concurrently
                else:
                    _expect(response, (200,), "OneDrive folder lookup")
                self._known_dirs.add(path)
            parent = path

    def _put(self, local: Path, remote: str) -> None:
        body = {"item": {"@microsoft.graph.conflictBehavior": "replace"}}
        session = self._authed("POST", self._item(remote) + "/createUploadSession", json=body)
        upload_url = str(_expect(session, (200,), "OneDrive createUploadSession").json().get("uploadUrl", ""))
        if not upload_url.startswith("https://"):
            raise BackupError("OneDrive returned an invalid upload session URL")
        size = local.stat().st_size
        try:
            offset = 0
            with open(local, "rb") as fh:
                while offset < size:
                    fh.seek(offset)
                    chunk = fh.read(_ONEDRIVE_CHUNK)
                    end = offset + len(chunk) - 1
                    # The upload URL is pre-authenticated: Graph rejects an Authorization header here.
                    headers = {"Content-Range": f"bytes {offset}-{end}/{size}"}
                    response = self._http().put(upload_url, content=chunk, headers=headers)
                    if response.status_code in (200, 201):
                        return
                    _expect(response, (202,), "OneDrive chunk upload")
                    ranges = response.json().get("nextExpectedRanges") or []
                    new_offset = int(str(ranges[0]).split("-")[0]) if ranges else end + 1
                    if new_offset <= offset:
                        raise BackupError("OneDrive upload session is not making progress")
                    offset = new_offset
            raise BackupError("OneDrive upload session ended without completion")
        except BaseException:
            with contextlib.suppress(Exception):
                self._http().delete(upload_url)
            raise

    def _remote_size(self, remote: str) -> int | None:
        response = self._authed("GET", self._item(remote), params={"$select": "size"})
        if response.status_code == 404:
            return None
        size = _expect(response, (200,), "OneDrive item").json().get("size")
        return int(size) if isinstance(size, int) else None

    def _list(self, remote_dir: str) -> list[str]:
        url: str | None = self._item(remote_dir) + "/children"
        params: dict[str, str] | None = {"$select": "name", "$top": "200"}
        names: list[str] = []
        while url:
            response = self._authed("GET", url, params=params)
            if response.status_code == 404:
                return []
            payload = _expect(response, (200,), "OneDrive children").json()
            names += [str(item["name"]) for item in payload.get("value") or [] if item.get("name")]
            next_link = payload.get("@odata.nextLink")
            url = next_link if isinstance(next_link, str) and next_link.startswith(_GRAPH + "/") else None
            params = None  # nextLink already carries the query
        return names

    def _delete(self, remote: str) -> None:
        _expect(self._authed("DELETE", self._item(remote)), (204, 404), "OneDrive delete")

    def _get(self, remote: str, local: Path) -> None:
        # /content answers 302 to a pre-authenticated URL; httpx drops Authorization on cross-origin redirects.
        url = self._item(remote) + "/content"
        with self._http().stream("GET", url, headers=self._oauth().headers(), follow_redirects=True) as response:
            _stream_to_file(response, local, "OneDrive download")


DESTINATION_REGISTRY: dict[DestinationType, type[BackupDestination]] = {
    DestinationType.SFTP: SFTPDestination,
    DestinationType.RSYNC_SSH: RsyncSSHDestination,
    DestinationType.WEBDAV: WebDAVDestination,
    DestinationType.S3_COMPATIBLE: S3CompatibleDestination,
    DestinationType.GOOGLE_DRIVE: GoogleDriveDestination,
    DestinationType.ONEDRIVE: OneDriveDestination,
}


def build_destination(config: DestinationConfig, credentials: CredentialProvider | None = None) -> BackupDestination:
    try:
        cls = DESTINATION_REGISTRY[config.type]
    except KeyError as err:
        raise ValueError(f"unsupported destination type: {config.type}") from err
    return cls(config, credentials)


# =============================================================================================
# Audit trail
# =============================================================================================


@dataclass(frozen=True)
class BackupAuditEvent:
    action: str  # <= 50 chars (tenant_audit_logs.action_type)
    tenant_id: uuid.UUID | None
    details: str  # never contains secrets


def record_audit_event(event: BackupAuditEvent) -> None:
    """Default sink: ``tenant_audit_logs`` (same table as the snapshot / replication scripts)."""
    try:
        from backend.database import SessionLocal
        from backend.models import TenantAuditLog
    except Exception as err:  # noqa: BLE001 - audit must never mask the backup outcome
        logger.warning("backup audit sink unavailable (%s): %s %s", type(err).__name__, event.action, event.details)
        return
    db = SessionLocal()
    try:
        db.add(
            TenantAuditLog(
                id=str(uuid.uuid4()),
                tenant_id=event.tenant_id,
                action_type=event.action[:50],
                actor="BACKUP_SERVICE",
                details=event.details,
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),  # column is naive UTC
            )
        )
        db.commit()
    except Exception as err:  # noqa: BLE001
        db.rollback()
        logger.error("failed to record backup audit event %s: %s", event.action, type(err).__name__)
    finally:
        db.close()


# =============================================================================================
# Worker / service
# =============================================================================================


def _default_work_dir() -> Path:
    configured = os.getenv("OXENGL_BACKUP_WORK_DIR", "/var/backups/oxengl/work")
    try:
        return _prepare_private_dir(Path(configured))
    except OSError:
        return _prepare_private_dir(Path.home() / ".oxengl" / "backups" / "work")  # repo-wide fallback pattern


@contextlib.contextmanager
def _exclusive_lock(path: Path) -> Iterator[None]:
    fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, "O_CLOEXEC", 0), 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as err:
            raise BackupError("another run of this backup policy is already in progress") from err
        yield
    finally:
        os.close(fd)


def _validate_member(member: tarfile.TarInfo) -> str:
    if not (member.isreg() or member.isdir()):
        raise BackupIntegrityError(f"archive member {member.name!r} has a forbidden type (links / devices)")
    name = safe_arcname(member.name)
    if name != member.name.rstrip("/"):
        raise PathTraversalError(f"archive member {member.name!r} has a non-canonical name")
    return name


class BackupService:
    """Orchestrates dump -> package -> encrypt -> fan-out upload -> verify -> retention -> audit."""

    def __init__(
        self,
        work_dir: Path | None = None,
        *,
        layout: StorageLayout | None = None,
        database: PgConnectionInfo | None = None,
        key_provider: BackupKeyProvider | None = None,
        credentials: CredentialProvider | None = None,
        audit_sink: Callable[[BackupAuditEvent], None] | None = None,
        dedicated_db_resolver: Callable[[uuid.UUID], str | None] | None = None,
        dedicated_databases: Callable[[], Mapping[uuid.UUID, str]] | None = None,
        upload_attempts: int = 3,
        keep_local_artifacts: bool = False,
    ) -> None:
        self.work_dir = _prepare_private_dir(Path(work_dir)) if work_dir else _default_work_dir()
        self.output_dir = _prepare_private_dir(self.work_dir / "artifacts")
        self.lock_dir = _prepare_private_dir(self.work_dir / "locks")
        self.layout = layout or StorageLayout.from_env()
        self.database = database or PgConnectionInfo.from_env()
        self.key_provider: BackupKeyProvider = key_provider or DefaultKeyProvider()
        self.credentials: CredentialProvider = credentials or EnvCredentialProvider()
        self.audit_sink = audit_sink or record_audit_event
        # Data-residency (ADR-005) hooks: the worker wires these to TenantConnectionManager's config table.
        self.dedicated_db_resolver = dedicated_db_resolver
        self.dedicated_databases = dedicated_databases
        self.upload_attempts = max(1, upload_attempts)
        self.keep_local_artifacts = keep_local_artifacts
        self.dump_timeout = float(os.getenv("OXENGL_BACKUP_DUMP_TIMEOUT", str(int(_DEFAULT_TRANSFER_TIMEOUT_S))))

    # ---- helpers ------------------------------------------------------------------------------------
    def _dumper(self, conn: PgConnectionInfo | None = None, *, use_container_socket: bool = True) -> PostgresDumper:
        return PostgresDumper(
            conn or self.database, use_container_socket=use_container_socket, timeout=self.dump_timeout
        )

    def _audit(self, action: str, tenant_id: uuid.UUID | None, details: str) -> None:
        try:
            self.audit_sink(BackupAuditEvent(action=action, tenant_id=tenant_id, details=details))
        except Exception as err:  # noqa: BLE001 - audit failures never change the run outcome
            logger.error("backup audit sink failed: %s", type(err).__name__)

    def _new_staging(
        self, scope: BackupScope, kind: BackupKind, tenant_id: uuid.UUID | None, since: datetime | None
    ) -> StagedBackup:
        staged = StagedBackup(
            backup_id=uuid.uuid4(),
            scope=scope,
            kind=kind,
            tenant_id=tenant_id,
            staging_dir=Path(tempfile.mkdtemp(prefix="stage-", dir=self.work_dir)),  # mkdtemp -> 0700
            since=since if kind is BackupKind.INCREMENTAL else None,
        )
        if kind is BackupKind.INCREMENTAL and since is None:
            staged.warnings.append("incremental run without a previous-run timestamp captured all files")
        _prepare_private_dir(staged.staging_dir / "database")
        return staged

    # ---- stage 1: data extraction -------------------------------------------------------------------
    def dump_tenant(
        self,
        tenant_id: uuid.UUID,
        kind: BackupKind,
        *,
        since: datetime | None = None,
        include_attachments: bool = True,
        include_invoices: bool = True,
        include_branding: bool = True,
    ) -> StagedBackup:
        """Tenant schema dump + the tenant's shared-table rows (one MVCC snapshot) + dedicated DB + assets.

        The database is always captured in full (logical dumps are self-contained); INCREMENTAL only limits
        file assets to those changed since ``since``.
        """
        tenant_id = uuid.UUID(str(tenant_id))
        staged = self._new_staging(BackupScope.TENANT, kind, tenant_id, since)
        db_dir = staged.staging_dir / "database"
        try:
            rows_dir = _prepare_private_dir(db_dir / "shared_rows")
            with _snapshot_session(self.database) as (pg, snapshot):
                with pg.cursor() as cur:
                    schema, known = _resolve_tenant(cur, tenant_id)
                    if not known:
                        raise BackupError(f"tenant {tenant_id} does not exist")
                    cur.execute("SHOW server_version")
                    server_version = cur.fetchone()[0]
                    if schema is not None:
                        if not _SCHEMA_RE.fullmatch(schema):
                            raise BackupError("registered tenant schema name failed validation")
                        cur.execute("SELECT 1 FROM pg_namespace WHERE nspname = %s", (schema,))
                        if cur.fetchone() is None:
                            staged.warnings.append(f"registered tenant schema {schema} does not exist")
                            schema = None
                if schema is not None:
                    out = db_dir / f"schema.{schema}.dump"
                    self._dumper().dump_database(out, schema=schema, snapshot=snapshot)
                    staged.add_database_file(
                        out, f"database/{out.name}", kind="schema_dump", format="custom", schema=schema
                    )
                else:
                    staged.warnings.append("tenant has no dedicated schema; data captured from shared tables only")
                for table, path in _export_shared_rows(pg, tenant_id, rows_dir):
                    staged.add_database_file(
                        path, f"database/shared_rows/{path.name}", kind="shared_rows_csv", table=f"public.{table}"
                    )
            if self.dedicated_db_resolver is not None:
                url = self.dedicated_db_resolver(tenant_id)
                if url:
                    conn = PgConnectionInfo.from_url(url)
                    out = db_dir / "dedicated.dump"
                    self._dumper(conn, use_container_socket=False).dump_database(out)
                    staged.add_database_file(
                        out, "database/dedicated.dump", kind="dedicated_dump", format="custom",
                        database=conn.dbname, host=conn.host,
                    )  # fmt: skip
            staged.asset_sources = asset_sources_for(
                self.layout,
                BackupScope.TENANT,
                tenant_id,
                include_attachments=include_attachments,
                include_invoices=include_invoices,
                include_branding=include_branding,
            )
            staged.manifest_extra.update(
                tenant_schema=schema, server_version=server_version, snapshot_consistent=snapshot is not None
            )
            return staged
        except BaseException:
            staged.cleanup()
            raise

    def dump_platform(
        self,
        kind: BackupKind,
        *,
        since: datetime | None = None,
        include_attachments: bool = True,
        include_invoices: bool = True,
        include_branding: bool = True,
    ) -> StagedBackup:
        """Full master database (all schemas), cluster globals, dedicated residency DBs and every asset root."""
        staged = self._new_staging(BackupScope.PLATFORM, kind, None, since)
        db_dir = staged.staging_dir / "database"
        try:
            dumper = self._dumper()
            out = db_dir / "platform.dump"
            dumper.dump_database(out)
            staged.add_database_file(
                out, "database/platform.dump", kind="database_dump", format="custom", database=self.database.dbname
            )
            globals_sql = db_dir / "globals.sql"
            try:
                dumper.dump_globals(globals_sql)
                staged.add_database_file(globals_sql, "database/globals.sql", kind="globals_sql", format="plain")
            except BackupError as err:  # needs elevated privileges; the database dump is still complete
                staged.warnings.append(f"cluster globals not captured: {err}")
            if self.dedicated_databases is not None:
                for tenant_id, url in sorted(self.dedicated_databases().items(), key=lambda kv: str(kv[0])):
                    tid = uuid.UUID(str(tenant_id))
                    conn = PgConnectionInfo.from_url(url)
                    target = _prepare_private_dir(db_dir / "dedicated") / f"{tid}.dump"
                    self._dumper(conn, use_container_socket=False).dump_database(target)
                    staged.add_database_file(
                        target, f"database/dedicated/{tid}.dump", kind="dedicated_dump", format="custom",
                        tenant_id=str(tid), database=conn.dbname,
                    )  # fmt: skip
            staged.asset_sources = asset_sources_for(
                self.layout,
                BackupScope.PLATFORM,
                None,
                include_attachments=include_attachments,
                include_invoices=include_invoices,
                include_branding=include_branding,
            )
            return staged
        except BaseException:
            staged.cleanup()
            raise

    # ---- stage 2: packaging + client-side encryption ------------------------------------------------
    def package_and_encrypt(self, staged: StagedBackup) -> BackupArtifact:
        """Stream tar.gz -> AES-256-GCM into ``output_dir``. Returns the ciphertext artifact + checksum."""
        key_id, key = self.key_provider.current()
        name = artifact_name(staged.scope, staged.kind, staged.created_at, staged.backup_id)
        final = self.output_dir / name
        partial = self.output_dir / (name + ".part")
        since_ts = staged.since.timestamp() if staged.since else None
        database_entries: list[dict[str, Any]] = []
        file_entries: list[dict[str, Any]] = []
        try:
            with _open_private_write(partial, exclusive=True) as raw:
                sink = _HashingSink(raw)
                encryptor = EncryptingWriter(sink, key, key_id)
                gz = gzip.GzipFile(filename="", mode="wb", fileobj=encryptor, compresslevel=6, mtime=0)  # type: ignore[arg-type]
                with tarfile.open(fileobj=gz, mode="w|", format=tarfile.PAX_FORMAT) as tar:
                    for item in staged.database_files:
                        database_entries.append({**item.meta, **_add_file_member(tar, item.path, item.arcname)})
                    for source in staged.asset_sources:
                        if not source.root.is_dir():
                            staged.warnings.append(f"asset root for {source.label!r} does not exist; nothing captured")
                            continue
                        for path, arcname in iter_asset_files(source, since=since_ts):
                            try:
                                file_entries.append(_add_file_member(tar, path, arcname))
                            except _SkipFile:
                                staged.warnings.append(f"skipped {arcname}: vanished or replaced during backup")
                    manifest = self._build_manifest(staged, key_id, database_entries, file_entries)
                    _add_bytes_member(tar, MANIFEST_NAME, json.dumps(manifest, indent=2, sort_keys=True).encode())
                gz.close()
                encryptor.close()
                raw.flush()
                os.fsync(raw.fileno())
            os.replace(partial, final)
        except BaseException:
            with contextlib.suppress(FileNotFoundError):
                partial.unlink()
            raise
        checksum_path = self.output_dir / (name + CHECKSUM_SUFFIX)
        _write_private(checksum_path, f"{sink.hexdigest()}  {name}\n".encode())
        return BackupArtifact(
            path=final,
            scope=staged.scope,
            kind=staged.kind,
            tenant_id=staged.tenant_id,
            sha256=sink.hexdigest(),
            size_bytes=sink.size,
            backup_id=staged.backup_id,
            key_id=key_id.hex(),
            checksum_path=checksum_path,
            created_at=staged.created_at,
        )

    @staticmethod
    def _build_manifest(
        staged: StagedBackup,
        key_id: bytes,
        database_entries: list[dict[str, Any]],
        file_entries: list[dict[str, Any]],
    ) -> dict[str, Any]:
        changed = sum(1 for entry in file_entries if entry["changed_during_backup"])
        if changed:
            staged.warnings.append(f"{changed} file(s) changed while being archived")
        return {
            "format": MANIFEST_FORMAT,
            "format_version": MANIFEST_VERSION,
            "backup_id": str(staged.backup_id),
            "scope": staged.scope.value,
            "kind": staged.kind.value,
            "tenant_id": str(staged.tenant_id) if staged.tenant_id else None,
            "created_at": staged.created_at.isoformat(),
            "files_since": staged.since.isoformat() if staged.since else None,
            "host": socket.gethostname(),
            "key_id": key_id.hex(),
            "database": {"engine": "postgresql", "files": database_entries, **staged.manifest_extra},
            "asset_roots": {source.label: str(source.root) for source in staged.asset_sources},
            "files": file_entries,
            "stats": {
                "database_files": len(database_entries),
                "database_bytes": sum(e["size"] for e in database_entries),
                "asset_files": len(file_entries),
                "asset_bytes": sum(e["size"] for e in file_entries),
            },
            "warnings": list(staged.warnings),
        }

    # ---- stage 3: fan-out ---------------------------------------------------------------------------
    def upload_all(self, artifact: BackupArtifact, destinations: list[DestinationConfig]) -> list[UploadResult]:
        """Upload to every enabled destination independently; one failure never blocks the others."""
        return [self._upload_one(artifact, cfg) for cfg in destinations if cfg.enabled]

    def _upload_one(self, artifact: BackupArtifact, cfg: DestinationConfig) -> UploadResult:
        started_at = datetime.now(timezone.utc)
        result = self._upload_one_inner(artifact, cfg)
        result.started_at = started_at
        result.finished_at = datetime.now(timezone.utc)
        return result

    def _upload_one_inner(self, artifact: BackupArtifact, cfg: DestinationConfig) -> UploadResult:
        last_error = "unknown error"
        attempt = 0
        for attempt in range(1, self.upload_attempts + 1):
            try:
                with build_destination(cfg, self.credentials) as destination:
                    result = destination.upload(artifact)
                result.attempts = attempt
                logger.info("backup %s uploaded to %s (%s) [%s]", artifact.path.name, cfg.name, cfg.id, result.verified)
                return result
            except Exception as err:  # noqa: BLE001 - isolate connector failures; continue with next destination
                last_error = _safe_error(err)
                logger.warning(
                    "backup upload to %s (%s) attempt %d/%d failed: %s",
                    cfg.name, cfg.id, attempt, self.upload_attempts, last_error,
                )  # fmt: skip
                if isinstance(err, ValueError):  # configuration / path errors: retrying cannot help
                    break
                if attempt < self.upload_attempts:
                    time.sleep(min(60, 5 * 2 ** (attempt - 1)))
        return UploadResult(destination_id=cfg.id, ok=False, error=last_error, attempts=attempt)

    def apply_retention(self, policy: BackupPolicy, uploads: list[UploadResult]) -> int:
        """Prune old archives on destinations that just received a verified copy."""
        succeeded = {u.destination_id for u in uploads if u.ok}
        removed = 0
        for cfg in policy.destinations:
            if cfg.id not in succeeded:
                continue
            try:
                with build_destination(cfg, self.credentials) as destination:
                    removed += destination.prune(
                        policy.scope, policy.tenant_id, policy.retention_daily, policy.retention_weekly
                    )
            except Exception as err:  # noqa: BLE001 - retention failure must not fail the backup
                logger.warning("retention on %s (%s) failed: %s", cfg.name, cfg.id, _safe_error(err))
        return removed

    def test_destination(self, cfg: DestinationConfig) -> None:
        with build_destination(cfg, self.credentials) as destination:
            destination.test_connection()

    # ---- entry points (called by the scheduler: celery beat / asyncio cron) -------------------------
    def run_policy(self, policy: BackupPolicy, kind: BackupKind, *, since: datetime | None = None) -> BackupRun:
        """Execute one scheduled run of ``policy``. ``since`` = start of the previous successful run
        (incremental file selection). Records the outcome in the audit trail."""
        run = BackupRun(
            policy_id=policy.id, kind=kind, status=BackupRunStatus.RUNNING, started_at=datetime.now(timezone.utc)
        )
        staged: StagedBackup | None = None
        try:
            with _exclusive_lock(self.lock_dir / f"{policy.id}.lock"):
                flags = {
                    "include_attachments": policy.include_attachments,
                    "include_invoices": policy.include_invoices,
                    "include_branding": policy.include_branding,
                }
                if policy.scope is BackupScope.TENANT:
                    if policy.tenant_id is None:  # guaranteed by BackupPolicy.__post_init__
                        raise BackupError("tenant policy without tenant_id")
                    staged = self.dump_tenant(policy.tenant_id, kind, since=since, **flags)
                else:
                    staged = self.dump_platform(kind, since=since, **flags)
                artifact = self.package_and_encrypt(staged)
                run.artifact = artifact
                run.warnings = list(staged.warnings)
                run.uploads = self.upload_all(artifact, policy.destinations)
                enabled = [cfg for cfg in policy.destinations if cfg.enabled]
                ok = sum(1 for upload in run.uploads if upload.ok)
                if not enabled:
                    run.status = BackupRunStatus.PARTIAL
                    run.warnings.append("no enabled destinations; archive retained locally only")
                elif ok == len(enabled):
                    run.status = BackupRunStatus.SUCCEEDED
                else:
                    run.status = BackupRunStatus.PARTIAL if ok else BackupRunStatus.FAILED
                if ok:
                    run.pruned = self.apply_retention(policy, run.uploads)
                if run.status is BackupRunStatus.SUCCEEDED and not self.keep_local_artifacts:
                    artifact.path.unlink(missing_ok=True)
                    if artifact.checksum_path:
                        artifact.checksum_path.unlink(missing_ok=True)
        except Exception as err:  # noqa: BLE001 - every failure is recorded, then surfaced via run.status
            run.status = BackupRunStatus.FAILED
            run.error = _safe_error(err)
            logger.error("backup policy %s (%s) failed: %s", policy.id, kind.value, run.error)
        finally:
            if staged is not None:
                staged.cleanup()
            run.finished_at = datetime.now(timezone.utc)
        self._audit(f"BACKUP_RUN_{run.status.value.upper()}", policy.tenant_id, self._run_details(policy, run))
        return run

    @staticmethod
    def _run_details(policy: BackupPolicy, run: BackupRun) -> str:
        parts = [f"policy={policy.id}", f"scope={policy.scope.value}", f"kind={run.kind.value}"]
        if run.artifact:
            parts.append(
                f"archive={run.artifact.path.name} ({run.artifact.size_bytes} bytes, "
                f"sha256={run.artifact.sha256}, key={run.artifact.key_id})"
            )
        if run.uploads:
            outcomes = [
                f"{u.destination_id}:" + (f"ok/{u.verified}" if u.ok else f"failed/{u.error}") for u in run.uploads
            ]
            parts.append("destinations=" + ", ".join(outcomes))
        if run.pruned:
            parts.append(f"pruned={run.pruned}")
        if run.error:
            parts.append(f"error={run.error}")
        if run.warnings:
            parts.append(f"warnings={len(run.warnings)}")
        return "; ".join(parts)

    # ---- verification and restore -------------------------------------------------------------------
    def verify_archive(self, archive: Path, *, extract_to: Path | None = None) -> dict[str, Any]:
        """Decrypt + authenticate every chunk, validate every member, compare against the manifest.

        With ``extract_to`` the members are also written (0600, confined) for restore; otherwise this is a
        pure restore drill that writes nothing. Returns the manifest.
        """
        hashes: dict[str, tuple[str, int]] = {}
        manifest_bytes: bytes | None = None
        if extract_to is not None:
            extract_to.mkdir(mode=0o700, parents=True, exist_ok=False)
        with open(archive, "rb") as raw:
            reader = DecryptingReader(raw, self.key_provider)
            with gzip.GzipFile(fileobj=reader, mode="rb") as gz:  # type: ignore[arg-type]
                with tarfile.open(fileobj=gz, mode="r|") as tar:
                    for member in tar:
                        name = _validate_member(member)
                        if member.isdir():
                            continue
                        source = tar.extractfile(member)
                        if source is None:
                            raise BackupIntegrityError(f"unreadable archive member {name!r}")
                        if name == MANIFEST_NAME:
                            manifest_bytes = source.read()
                            continue
                        if name in hashes:
                            raise BackupIntegrityError(f"duplicate archive member {name!r}")
                        target_ctx: Any = contextlib.nullcontext(None)
                        if extract_to is not None:
                            target = extract_to.joinpath(*name.split("/"))
                            ensure_within(extract_to, target.parent)
                            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                            ensure_within(extract_to, target)
                            target_ctx = _open_private_write(target, exclusive=True)
                        digest = hashlib.sha256()
                        with target_ctx as out:
                            while chunk := source.read(_COPY_BUFSIZE):
                                digest.update(chunk)
                                if out is not None:
                                    out.write(chunk)
                        hashes[name] = (digest.hexdigest(), member.size)
                while gz.read(_COPY_BUFSIZE):  # drain: verifies gzip CRC and authenticates the final chunk
                    pass
            if reader.read(1) or not reader.finished:
                raise BackupIntegrityError("archive has trailing data or ended before its final chunk")
        if manifest_bytes is None:
            raise BackupIntegrityError("archive has no manifest")
        manifest = json.loads(manifest_bytes)
        if manifest.get("format") != MANIFEST_FORMAT or manifest.get("format_version") != MANIFEST_VERSION:
            raise BackupIntegrityError("unrecognised manifest format")
        expected = {e["path"]: e for e in manifest["database"]["files"] + manifest["files"]}
        if set(expected) != set(hashes):
            raise BackupIntegrityError("archive members do not match the manifest")
        for path, (digest, size) in hashes.items():
            if expected[path]["sha256"] != digest or expected[path]["size"] != size:
                raise BackupIntegrityError(f"checksum mismatch for archive member {path!r}")
        return manifest

    def restore(
        self,
        artifact_remote_path: str,
        destination: DestinationConfig,
        *,
        tenant_id: uuid.UUID | None,
        expected_sha256: str | None = None,
        apply_database: bool = False,
        apply_files: bool = False,
    ) -> RestoreResult:
        """Download, verify checksum, decrypt, validate and stage an archive; optionally apply it.

        Staging is always performed. ``apply_database`` runs pg_restore (--clean, single transaction) for
        the tenant schema dump / platform dump; ``apply_files`` writes assets back to the current storage
        layout. Shared-table CSVs, dedicated-DB dumps and cluster globals stay staged for an operator-run
        merge (``RestoreResult.warnings`` lists them). The caller must call ``RestoreResult.cleanup()``.
        """
        restore_dir = Path(tempfile.mkdtemp(prefix="restore-", dir=self.work_dir))
        try:
            with build_destination(destination, self.credentials) as dest:
                local = dest.download(artifact_remote_path, restore_dir)
                if expected_sha256 is None:
                    sidecar = dest.download(artifact_remote_path + CHECKSUM_SUFFIX, restore_dir)
                    expected_sha256 = _parse_checksum_file(sidecar, local.name)
            if not hmac.compare_digest(_sha256_file(local), expected_sha256.lower()):
                raise BackupIntegrityError("downloaded archive checksum mismatch")
            extracted = restore_dir / "extracted"
            manifest = self.verify_archive(local, extract_to=extracted)
            local.unlink()
            self._check_restore_scope(manifest, tenant_id)
            result = RestoreResult(manifest=manifest, extracted_dir=extracted)
            if manifest.get("kind") == BackupKind.INCREMENTAL.value:
                result.warnings.append(
                    f"incremental archive: files cover changes since {manifest.get('files_since')}; "
                    "restore the preceding full archive first"
                )
            if apply_database:
                result.database_restored = self._apply_database(manifest, extracted, tenant_id, result.warnings)
            if apply_files:
                result.files_restored = self._apply_files(manifest, extracted, tenant_id, result.warnings)
        except Exception as err:
            shutil.rmtree(restore_dir, ignore_errors=True)
            self._audit(
                "BACKUP_RESTORE_FAILED",
                tenant_id,
                f"remote={artifact_remote_path}; destination={destination.id}; error={_safe_error(err)}",
            )
            raise
        self._audit(
            "BACKUP_RESTORE_COMPLETED",
            tenant_id,
            f"backup_id={manifest.get('backup_id')}; destination={destination.id}; "
            f"database_restored={result.database_restored}; files_restored={result.files_restored}",
        )
        return result

    @staticmethod
    def _check_restore_scope(manifest: dict[str, Any], tenant_id: uuid.UUID | None) -> None:
        if tenant_id is not None:
            if manifest.get("scope") != BackupScope.TENANT.value or manifest.get("tenant_id") != str(tenant_id):
                raise BackupError("archive does not belong to this tenant")
        elif manifest.get("scope") != BackupScope.PLATFORM.value:
            raise BackupError("platform restore requires a platform-scope archive")

    def _apply_database(
        self, manifest: dict[str, Any], extracted: Path, tenant_id: uuid.UUID | None, warnings: list[str]
    ) -> bool:
        restored = False
        dumper = self._dumper()
        staged_kinds: set[str] = set()
        for entry in manifest["database"]["files"]:
            path = ensure_within(extracted, extracted.joinpath(*entry["path"].split("/")))
            kind = entry.get("kind")
            if kind == "schema_dump" and tenant_id is not None:
                dumper.restore_database(path, schema=entry["schema"])
                restored = True
            elif kind == "database_dump" and tenant_id is None:
                dumper.restore_database(path)
                restored = True
            else:
                staged_kinds.add(str(kind))
        for kind in sorted(staged_kinds):
            warnings.append(f"{kind} entries were staged under {extracted / 'database'} and not applied automatically")
        return restored

    def _apply_files(
        self, manifest: dict[str, Any], extracted: Path, tenant_id: uuid.UUID | None, warnings: list[str]
    ) -> int:
        scope = BackupScope.TENANT if tenant_id is not None else BackupScope.PLATFORM
        sources = {s.label: s for s in asset_sources_for(self.layout, scope, tenant_id)}
        restored = 0
        unmapped: set[str] = set()
        for entry in manifest["files"]:
            parts = safe_arcname(entry["path"]).split("/")
            if len(parts) < 3 or parts[0] != "files":
                raise BackupIntegrityError(f"unexpected asset entry {entry['path']!r}")
            label, relative = parts[1], parts[2:]
            source = sources.get(label)
            if source is None:
                unmapped.add(label)
                continue
            if source.name_prefix and (len(relative) != 1 or not relative[0].startswith(source.name_prefix)):
                raise BackupIntegrityError(f"asset {entry['path']!r} lies outside the tenant's namespace")
            source.root.mkdir(parents=True, exist_ok=True, mode=0o750)
            target = ensure_within(source.root, source.root.joinpath(*relative))
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
            ensure_within(source.root, target.parent)  # re-check after mkdir (symlinked directories)
            staged_file = ensure_within(extracted, extracted.joinpath(*parts))
            temp = target.with_name(f".{target.name}.oxbk-restore")
            shutil.copyfile(staged_file, temp, follow_symlinks=False)
            os.chmod(temp, int(entry.get("mode", 0o640)) & 0o777)
            os.replace(temp, target)
            os.utime(target, (entry["mtime"], entry["mtime"]))
            restored += 1
        for label in sorted(unmapped):
            warnings.append(f"no restore target for asset label {label!r}; files left staged in {extracted / 'files'}")
        return restored
