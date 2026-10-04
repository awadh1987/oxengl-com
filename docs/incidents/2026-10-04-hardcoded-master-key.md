# 2026-10-04 — Hard-coded master provisioning key (X-Master-Admin-Key)

**Severity:** Critical (cross-tenant privilege escalation) · **Status:** Fixed and deployed

## Summary
`is_super_admin_authorized()` (in both `backend/app/core/auth.py` and `backend/app/main.py`)
accepted an `X-Master-Admin-Key` header and compared it to
`os.getenv("MASTER_PLATFORM_KEY", "<hard-coded default>")`. `MASTER_PLATFORM_KEY` was not set in
production, so the public default from source control was the live key. Any authenticated tenant
user who sent that header got platform-owner scope. For example, the Myon admin could list every
company on the platform.

## Verification (production, before → after)
| Caller | Before | After |
|---|---|---|
| Myon admin, no header | Myon only | Myon only |
| Myon admin + legacy default key | **all companies** | Myon only |
| Myon admin + wrong key | Myon only | Myon only |
| Myon admin + configured key | n/a | all companies (intended provisioning path) |
| `superadmin@oxengl.com` | all companies | all companies |

## Fix
- Removed the hard-coded fallback. The header bypass now works only when `MASTER_PLATFORM_KEY` is
  explicitly configured, and the comparison is constant-time (`hmac.compare_digest`).
- Production runtime config now sets a freshly generated random `MASTER_PLATFORM_KEY`,
  `ENVIRONMENT=production` and `OXENGL_DEV_MODE=false`. Values live only in the server's
  git-ignored `.env` (mode 600) and are never committed.
- `SESSION_COOKIE_DOMAIN` is set to empty so that session cookies stay host-only, as they were
  before. Without it, `ENVIRONMENT=production` would scope cookies to `.oxengl.me`. That would
  share sessions across tenant subdomains and break tenant custom domains.
- Bytecode caches are stripped from the deployed image, so the old key does not survive in `.pyc` files.

## Notes / follow-ups
- The legacy default key is still present in git history. It is now inert, because the code no
  longer falls back to it and production uses a different random key.
- The dev-mode clause in `is_super_admin_authorized()` is still on by default when `ENVIRONMENT` and
  `OXENGL_DEV_MODE` are unset. Production sets both explicitly. Changing the default to off in code is
  recommended.
