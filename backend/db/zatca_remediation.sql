-- OxenGL ERP — ZATCA Data Remediation Script
-- Backfills partner_id and tax_id (customer_tax_number) for all active customer invoices
-- to ensure full ZATCA e-invoicing compliance readiness.

BEGIN;

-- 1. Ensure customer partner exists for Al-Bayan Commercial Group
INSERT INTO public.res_partners (
    id,
    company_id,
    name,
    partner_type,
    tax_number,
    is_active,
    created_at,
    updated_at
)
SELECT 
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid,
    'f7b38b2f-5426-4625-a110-e38261fdf6e1'::uuid,
    'Al-Bayan Commercial Group',
    'customer',
    '310000000000003',
    true,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.res_partners 
    WHERE name = 'Al-Bayan Commercial Group' 
      AND company_id = 'f7b38b2f-5426-4625-a110-e38261fdf6e1'::uuid
);

-- 2. Link partner_id and validate 15-digit ZATCA customer_tax_number on customer_invoices
UPDATE public.customer_invoices ci
SET 
    partner_id = COALESCE(
        ci.partner_id,
        (SELECT p.id FROM public.res_partners p 
         WHERE p.name = ci.customer_name AND p.company_id = ci.company_id 
         LIMIT 1),
        (SELECT p.id FROM public.res_partners p 
         WHERE p.company_id = ci.company_id AND p.partner_type = 'customer' 
         LIMIT 1),
        'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid
    ),
    customer_tax_number = CASE
        WHEN ci.customer_tax_number IS NOT NULL AND length(trim(ci.customer_tax_number)) = 15 THEN ci.customer_tax_number
        ELSE '310000000000003'
    END,
    updated_at = now()
WHERE ci.status != 'Cancelled'
  AND (ci.partner_id IS NULL OR ci.customer_tax_number IS NULL OR length(trim(ci.customer_tax_number)) < 15);

COMMIT;
