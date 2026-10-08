# OxenGL Foundation Seeding & FX Cache Benchmark Specifications
**Objective:** Instantiate the 5-level hierarchical Chart of Accounts using the `ltree` extension, deploy an async currency test rig, and validate cache-aside ratios under load.

---

## ASSET A: DATABASE TREE SEED (`backend/app/domains/finance/bootstrap_seed.sql`)
```sql
CREATE EXTENSION IF NOT EXISTS ltree SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;
TRUNCATE TABLE role_permissions, user_roles, roles, permissions, accounts, users, companies, tenants CASCADE;
INSERT INTO tenants (id, name, schema_name, is_active) VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'OxenGL Global Logistics', 'tenant_001', TRUE);
INSERT INTO companies (id, tenant_id, name, currency, is_active) VALUES ('f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c'::uuid, 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'ME Operating Branch', 'USD', TRUE);
INSERT INTO roles (id, tenant_id, name, description, is_system_role) VALUES 
('11111111-1111-1111-1111-111111111111'::uuid, 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'SUPER_ADMIN', 'Master Gatekeeper', TRUE),
('22222222-2222-2222-2222-222222222222'::uuid, 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'FINANCE_MANAGER', 'GL Lead', FALSE);
INSERT INTO users (id, tenant_id, username, email, password_hash, mfa_enabled, status, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'admin.oxengl', 'admin@oxengl.com', crypt('OxenGL@2026Secure!', gen_salt('bf', 10)), FALSE, 'ACTIVE', NOW(), NOW());
INSERT INTO user_roles (user_id, role_id) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '11111111-1111-1111-1111-111111111111'::uuid);
INSERT INTO accounts (id, tenant_id, company_id, code, name, path, account_type, is_active) VALUES
(uuid_generate_v4(), 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c'::uuid, '100000', 'Assets', 'assets', 'ASSET', TRUE),
(uuid_generate_v4(), 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c'::uuid, '110000', 'Current Assets', 'assets.current_assets', 'ASSET', TRUE),
(uuid_generate_v4(), 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c'::uuid, '111000', 'Cash & Banks', 'assets.current_assets.cash_and_banks', 'ASSET', TRUE),
(uuid_generate_v4(), 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c'::uuid, '111100', 'Local Bank Accounts', 'assets.current_assets.cash_and_banks.local_banks', 'ASSET', TRUE),
(uuid_generate_v4(), 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'::uuid, 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c'::uuid, '111101', 'Main Operating Account', 'assets.current_assets.cash_and_banks.local_banks.main_operating_account', 'ASSET', FALSE);
CREATE INDEX IF NOT EXISTS idx_accounts_path_gist ON accounts USING gist(path);
```

---

## ASSET B: CACHE BENCHMARK TEST RIG (`scripts/stress_test_currency_cache.py`)
```python
import asyncio, time, random, httpx, redis.asyncio as aioredis
URL, KEY, R_URL = "https://frankfurter.dev", "oxengl:staging:tenant_001:procurement:fx_rates:usd_eur", "redis://localhost:6379/0"
class FXTester:
    def __init__(self): self.r, self.http, self.hits, self.miss = None, None, 0, 0
    async def fetch(self, idx: int):
        val = await self.r.get(KEY)
        if val: self.hits += 1; return float(val)
        self.miss += 1; res = await self.http.get(URL); rate = float(res.json()["rates"]["EUR"])
        await self.r.set(KEY, str(rate), ex=3600 + random.randint(0, 60)); return rate
    async def run(self):
        self.r = aioredis.from_url(R_URL, decode_responses=True); self.http = httpx.AsyncClient(); await self.r.delete(KEY); start = time.perf_counter()
        await asyncio.gather(*(self.fetch(i) for i in range(50)))
        print(f"Done in {(time.perf_counter()-start)*1000:.2f}ms | Hits: {self.hits} | Misses: {self.miss}")
        await self.http.aclose(); await self.r.close()
if __name__ == "__main__": asyncio.run(FXTester().run())
```

# Instruction
Read and execute the setup instructions specified in our blueprint file at `docs/blueprints/seed_and_stress_test.md`.

# Sub-Tasks
1. Write the SQL script to `backend/app/domains/finance/bootstrap_seed.sql`. Execute it against our live container via: `docker exec -i oxengl_postgres_container psql -U postgres -d erp_db -f /app/app/domains/finance/bootstrap_seed.sql`.
2. Write the performance test script to `scripts/stress_test_currency_cache.py` and run it via `python3 scripts/stress_test_currency_cache.py`.

Confirm once the structural layout is seeded and display the final benchmark execution timings.
