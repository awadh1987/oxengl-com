# Environment Variable Recovery

On 2026-10-05, the `DATA_RESIDENCY_KEY`, `JWT_SECRET`, `JWT_SECRET_MASTER`,
`JWT_SECRET_TENANT`, and `DB_PASSWORD` environment variables were recovered
from the stopped `oxengl_backend_prev` container and restored to the local
compose `.env` file so the backend could start with its existing encryption,
database, and native authentication configuration.

Secret values are intentionally not recorded here:

| Variable | Recovery source | Repository documentation |
| --- | --- | --- |
| `DATA_RESIDENCY_KEY` | Previous backend container environment | `<REDACTED>` |
| `JWT_SECRET` | Previous backend container environment | `<REDACTED>` |
| `JWT_SECRET_MASTER` | Previous backend container environment | `<REDACTED>` |
| `JWT_SECRET_TENANT` | Previous backend container environment | `<REDACTED>` |
| `DB_PASSWORD` | Previous backend container environment | `<REDACTED>` |

The `.env` file is ignored by Git and must remain untracked. Do not copy secret
values into source files, logs, documentation, or commits. Rotate any recovered
credential if its confidentiality is uncertain.
