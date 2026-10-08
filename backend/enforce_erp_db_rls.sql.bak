-- Post-migration hardening for the shared erp_db schema.
-- Run as the database owner after application tables exist.
-- Tenant tables are scoped by tenant_id/company_id; child and control-plane
-- tables have explicit policies below. Unknown unscoped tables fail closed.

DO $oxengl_rls$
DECLARE
    table_row RECORD;
    tenant_predicate TEXT;
    policy_predicate TEXT;
    platform_predicate CONSTANT TEXT :=
        'current_user = ''oxengl_platform''';
    tenant_setting CONSTANT TEXT :=
        'NULLIF(current_setting(''app.current_tenant_id'', true), '''')';
    table_count INTEGER := 0;
    covered_count INTEGER;
BEGIN
    FOR table_row IN
        SELECT c.oid, c.relname,
               bool_or(a.attname = 'tenant_id') AS has_tenant_id,
               bool_or(a.attname = 'company_id') AS has_company_id
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attribute a
          ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        GROUP BY c.oid, c.relname
        ORDER BY c.relname
    LOOP
        table_count := table_count + 1;
        tenant_predicate := NULL;

        IF table_row.has_tenant_id AND table_row.has_company_id THEN
            tenant_predicate := format(
                'tenant_id::text = %s AND (company_id IS NULL OR company_id::text = %s)',
                tenant_setting, tenant_setting
            );
        ELSIF table_row.has_tenant_id THEN
            tenant_predicate := format('tenant_id::text = %s', tenant_setting);
        ELSIF table_row.has_company_id THEN
            tenant_predicate := format('company_id::text = %s', tenant_setting);
        ELSE
            CASE table_row.relname
                WHEN 'res_companies' THEN
                    tenant_predicate := format('id::text = %s', tenant_setting);
                WHEN 'tenants' THEN
                    tenant_predicate := format('id::text = %s', tenant_setting);
                WHEN 'goods_receipt_batch_logs' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.goods_receipts parent_row '
                        'WHERE parent_row.id = goods_receipt_batch_logs.goods_receipt_id '
                        'AND parent_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'invoices' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.finance_journal_entries parent_row '
                        'WHERE parent_row.id = invoices.journal_entry_id '
                        'AND parent_row.tenant_id::text = %s)', tenant_setting
                    );
                WHEN 'journal_lines' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.journal_entries entry_row '
                        'JOIN public.accounts account_row ON account_row.id = journal_lines.account_id '
                        'WHERE entry_row.id = journal_lines.entry_id '
                        'AND entry_row.tenant_id::text = %s '
                        'AND account_row.tenant_id::text = %s)', tenant_setting, tenant_setting
                    );
                WHEN 'landed_cost_items' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.landed_cost_allocations allocation_row '
                        'JOIN public.materials material_row ON material_row.id = landed_cost_items.material_id '
                        'WHERE allocation_row.id = landed_cost_items.allocation_id '
                        'AND allocation_row.tenant_id::text = %s '
                        'AND (material_row.tenant_id::text = %s OR material_row.company_id::text = %s))',
                        tenant_setting, tenant_setting, tenant_setting
                    );
                WHEN 'manifest_stops' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.delivery_manifests manifest_row '
                        'JOIN public.waybills waybill_row ON waybill_row.id = manifest_stops.waybill_id '
                        'WHERE manifest_row.id = manifest_stops.manifest_id '
                        'AND manifest_row.tenant_id::text = %s '
                        'AND waybill_row.tenant_id::text = %s)', tenant_setting, tenant_setting
                    );
                WHEN 'purchase_order_lines' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.purchase_orders parent_row '
                        'WHERE parent_row.id = purchase_order_lines.purchase_order_id '
                        'AND parent_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'purchase_requisition_lines' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.purchase_requisitions parent_row '
                        'WHERE parent_row.id = purchase_requisition_lines.requisition_id '
                        'AND parent_row.tenant_id::text = %s)', tenant_setting
                    );
                WHEN 'workflow_steps' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.workflow_instances parent_row '
                        'WHERE parent_row.id = workflow_steps.instance_id '
                        'AND parent_row.tenant_id::text = %s)', tenant_setting
                    );
                WHEN 'tender_rfq_lines' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.procurement_tenders parent_row '
                        'WHERE parent_row.id = tender_rfq_lines.tender_id '
                        'AND parent_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'procurement_bids' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.procurement_tenders parent_row '
                        'WHERE parent_row.id = procurement_bids.tender_id '
                        'AND parent_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'procurement_bid_lines' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.procurement_bids bid_row '
                        'JOIN public.procurement_tenders tender_row ON tender_row.id = bid_row.tender_id '
                        'JOIN public.tender_rfq_lines line_row ON line_row.id = procurement_bid_lines.tender_line_id '
                        'WHERE bid_row.id = procurement_bid_lines.bid_id '
                        'AND tender_row.company_id::text = %s '
                        'AND line_row.tender_id = tender_row.id)', tenant_setting
                    );
                WHEN 'refresh_tokens' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.user_sessions parent_row '
                        'WHERE parent_row.id = refresh_tokens.session_id '
                        'AND parent_row.user_id = refresh_tokens.user_id '
                        'AND parent_row.tenant_id::text = %s)', tenant_setting
                    );
                WHEN 'security_tokens' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.res_users parent_row '
                        'WHERE parent_row.id = security_tokens.user_id '
                        'AND parent_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'tenant_users' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.res_users user_row '
                        'WHERE lower(user_row.email) = lower(tenant_users.email) '
                        'AND user_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'tenant_password_resets' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.tenant_users tenant_user '
                        'JOIN public.res_users user_row ON lower(user_row.email) = lower(tenant_user.email) '
                        'WHERE tenant_user.id = tenant_password_resets.user_id '
                        'AND user_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'tenant_user_invitations' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.tenant_users tenant_user '
                        'JOIN public.res_users user_row ON lower(user_row.email) = lower(tenant_user.email) '
                        'WHERE tenant_user.id = tenant_user_invitations.invited_by_id '
                        'AND user_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'password_resets' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.res_companies company_row '
                        'WHERE company_row.slug = password_resets.workspace_slug '
                        'AND company_row.id::text = %s)', tenant_setting
                    );
                WHEN 'login_attempts' THEN
                    tenant_predicate := format(
                        'EXISTS (SELECT 1 FROM public.res_users user_row '
                        'WHERE lower(user_row.email) = lower(login_attempts.username) '
                        'AND user_row.company_id::text = %s)', tenant_setting
                    );
                WHEN 'subscription_plans' THEN
                    tenant_predicate := 'is_active IS TRUE';
                WHEN 'sso_providers' THEN
                    tenant_predicate := 'is_active IS TRUE';
                WHEN 'platform_feature_flags' THEN
                    tenant_predicate := 'TRUE';
                WHEN 'alembic_version' THEN
                    tenant_predicate := platform_predicate;
                WHEN 'master_audit_logs' THEN
                    tenant_predicate := platform_predicate;
                WHEN 'master_password_resets' THEN
                    tenant_predicate := platform_predicate;
                WHEN 'master_tenants' THEN
                    tenant_predicate := platform_predicate;
                WHEN 'master_users' THEN
                    tenant_predicate := platform_predicate;
                WHEN 'platform_settings' THEN
                    tenant_predicate := platform_predicate;
                ELSE
                    RAISE EXCEPTION 'No tenant or control-plane policy mapping for public.%', table_row.relname;
            END CASE;
        END IF;

        IF table_row.relname = 'login_attempts' THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_row.relname);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_all ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_select ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_insert ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_update ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_delete ON public.%I', table_row.relname);
            EXECUTE format('CREATE POLICY oxengl_rls_select ON public.%I FOR SELECT USING ((%s) OR %s)',
                           table_row.relname, platform_predicate, tenant_predicate);
            EXECUTE format('CREATE POLICY oxengl_rls_insert ON public.%I FOR INSERT WITH CHECK (TRUE)',
                           table_row.relname);
            EXECUTE format('CREATE POLICY oxengl_rls_update ON public.%I FOR UPDATE USING ((%s) OR %s) WITH CHECK ((%s) OR %s)',
                           table_row.relname, platform_predicate, tenant_predicate,
                           platform_predicate, tenant_predicate);
            EXECUTE format('CREATE POLICY oxengl_rls_delete ON public.%I FOR DELETE USING ((%s) OR %s)',
                           table_row.relname, platform_predicate, tenant_predicate);
        ELSIF table_row.relname IN ('subscription_plans', 'sso_providers', 'platform_feature_flags') THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_row.relname);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_all ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_select ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_insert ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_update ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_delete ON public.%I', table_row.relname);
            EXECUTE format('CREATE POLICY oxengl_rls_select ON public.%I FOR SELECT USING (%s)',
                           table_row.relname, tenant_predicate);
            EXECUTE format('CREATE POLICY oxengl_rls_insert ON public.%I FOR INSERT WITH CHECK (%s)',
                           table_row.relname, platform_predicate);
            EXECUTE format('CREATE POLICY oxengl_rls_update ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
                           table_row.relname, platform_predicate, platform_predicate);
            EXECUTE format('CREATE POLICY oxengl_rls_delete ON public.%I FOR DELETE USING (%s)',
                           table_row.relname, platform_predicate);
        ELSE
            policy_predicate := format('((%s) OR (%s))', platform_predicate, tenant_predicate);
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_row.relname);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_all ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_select ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_insert ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_update ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS oxengl_rls_delete ON public.%I', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || table_row.relname || '_isolation', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || table_row.relname || '_select', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || table_row.relname || '_insert', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || table_row.relname || '_update', table_row.relname);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || table_row.relname || '_delete', table_row.relname);
            EXECUTE format('CREATE POLICY oxengl_rls_all ON public.%I FOR ALL USING (%s) WITH CHECK (%s)',
                           table_row.relname, policy_predicate, policy_predicate);
        END IF;
    END LOOP;

    SELECT count(DISTINCT c.oid)
      INTO covered_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relrowsecurity
       AND c.relforcerowsecurity;

    IF covered_count <> table_count THEN
        RAISE EXCEPTION 'RLS coverage mismatch: % tables, % enabled/forced with policies',
            table_count, covered_count;
    END IF;
END;
$oxengl_rls$;

DO $oxengl_app_role$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_app') THEN
        EXECUTE 'CREATE ROLE oxengl_app LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT';
    END IF;
END;
$oxengl_app_role$;

ALTER ROLE oxengl_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
DO $oxengl_platform_role$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oxengl_platform') THEN
        EXECUTE 'CREATE ROLE oxengl_platform LOGIN NOSUPERUSER BYPASSRLS NOINHERIT';
    END IF;
END;
$oxengl_platform_role$;

ALTER ROLE oxengl_platform WITH LOGIN NOSUPERUSER BYPASSRLS NOINHERIT;
GRANT CONNECT ON DATABASE erp_db TO oxengl_app;
GRANT CONNECT ON DATABASE erp_db TO oxengl_platform;
GRANT USAGE ON SCHEMA public TO oxengl_app;
GRANT USAGE ON SCHEMA public TO oxengl_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oxengl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oxengl_platform;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO oxengl_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO oxengl_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oxengl_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oxengl_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO oxengl_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO oxengl_platform;

DO $oxengl_context_function$
BEGIN
    IF to_regprocedure('public.set_tenant_context(uuid,boolean)') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.set_tenant_context(uuid, boolean) FROM PUBLIC';
        EXECUTE 'REVOKE ALL ON FUNCTION public.set_tenant_context(uuid, boolean) FROM oxengl_app';
        EXECUTE 'REVOKE ALL ON FUNCTION public.set_tenant_context(uuid, boolean) FROM oxengl_platform';
    END IF;
END;
$oxengl_context_function$;
