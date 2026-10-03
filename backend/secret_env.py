"""
Strict secret loading for OxenGL authentication keys.
File: backend/secret_env.py

There are deliberately NO fallback values: a missing, short, or known-public secret
raises RuntimeError at import time so the API process refuses to start instead of
silently signing/accepting tokens with a key that is published in the repository.
"""

from __future__ import annotations

import os

MIN_SECRET_LENGTH = 32

# Values that were once hard-coded as defaults in this codebase (and are therefore public).
# Kept only as a denylist so they can never be re-introduced via the environment.
KNOWN_PUBLIC_SECRETS = frozenset({
    "oxengl-master-control-plane-secret-key-32b-min",
    "oxengl-tenant-plane-secret-key-32b-min",
    "oxengl-default-jwt-secret-key-prod-2026",
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "development-secret-change-me",
})


def require_secret(*names: str) -> str:
    """
    Return the first non-empty environment variable among ``names``.

    Raises RuntimeError if none is set, or if the value is shorter than
    MIN_SECRET_LENGTH characters, or if it is a known-public former default.
    """
    if not names:
        raise ValueError("require_secret() needs at least one variable name")
    for name in names:
        value = (os.getenv(name) or "").strip()
        if not value:
            continue
        if value in KNOWN_PUBLIC_SECRETS:
            raise RuntimeError(
                f"CRITICAL SECURITY CONFIGURATION ERROR: {name} is set to a publicly known default. "
                "Generate a new random secret (e.g. `openssl rand -hex 32`)."
            )
        if len(value) < MIN_SECRET_LENGTH:
            raise RuntimeError(
                f"CRITICAL SECURITY CONFIGURATION ERROR: {name} must be at least {MIN_SECRET_LENGTH} characters."
            )
        return value
    raise RuntimeError(
        "CRITICAL SECURITY CONFIGURATION ERROR: required secret "
        + " / ".join(names)
        + " is not set. Refusing to start without it."
    )
