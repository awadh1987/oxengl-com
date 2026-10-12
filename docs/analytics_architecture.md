```markdown
# OxenGL Hybrid Analytics Architecture

## 1. BigQuery Row-Level Security (RLS) Configuration
To safely expose staging tables to external BI tools (e.g., Looker, Power BI) while ensuring multi-tenant isolation, implement dynamic Row Access Policies that map service accounts to their authorized `company_id`.

**Step 1.1: Create a Tenant Access Mapping Table**
```sql
CREATE OR REPLACE TABLE `project-587cf20f-74ef-484a-ba6.oxengl_staging.tenant_access_map` (
    principal_email STRING,
    company_id STRING
);

```

**Step 1.2: Apply Row Access Policies**
Execute the following DDL for each staging table to enforce tenant isolation at the query engine level:

```sql
CREATE OR REPLACE ROW ACCESS POLICY tenant_isolation_invoices 
ON `project-587cf20f-74ef-484a-ba6.oxengl_staging.stg_customer_invoices`
GRANT TO ('domain:yourdomain.com', 'serviceAccount:bi-tool@project-587cf20f-74ef-484a-ba6.iam.gserviceaccount.com')
FILTER USING (
    company_id IN (
        SELECT company_id 
        FROM `project-587cf20f-74ef-484a-ba6.oxengl_staging.tenant_access_map` 
        WHERE principal_email = SESSION_USER()
    )
);

```

*(Repeat the policy creation for `stg_finance_journal_entries`, `stg_purchase_orders`, etc.)*

## 2. FastAPI Proxy & Redis Caching Layer

For the embedded React application, direct BigQuery access is prohibited. FastAPI acts as the secure proxy, injecting the authenticated tenant's ID into BigQuery queries and caching payloads in Redis to drop latencies to milliseconds.

**Backend Implementation Requirements:**

* **Parameterized Queries:** Never use string interpolation for SQL. Pass the authenticated user's `company_id` via `bigquery.QueryJobConfig(query_parameters=[...])` to prevent SQL injection and guarantee tenant isolation.
* **Redis Caching Protocol:** Check Redis for a cached response using the composite key `analytics:{company_id}:{dashboard_id}`. If a cache miss occurs, query BigQuery, serialize the JSON payload, and write it back to Redis with a 15–30 minute expiration (TTL).
* **Asynchronous Execution:** Utilize the `google-cloud-bigquery` client concurrently with `aioredis` (or `redis-py` async) to prevent blocking the ASGI event loop.

## 3. Architectural Scaling Strategy

To maintain linear BigQuery compute costs as ERP transaction volumes grow, apply these optimizations to the Dataform pipeline and BigQuery schema.

* **Incremental Materializations:** Refactor high-volume staging definitions (like `stg_inventory_movements`) from `type: "table"` to `type: "incremental"` to process only delta updates instead of full table scans during DAG runs.
* **Partitioning & Clustering:** Group data physically on disk to maximize query pruning. Configure Dataform to partition transaction tables by `issue_date` or `created_at` (daily/monthly blocks) and cluster them by `company_id` and `partner_id`.
* **View vs. Table Strategy:** If a staging model requires no heavy joins or aggregations, deploy it as a `view`. This shifts the compute overhead away from the scheduled ETL run directly to the BI queries, where it can be heavily mitigated by BigQuery BI Engine memory caching.

```

```
