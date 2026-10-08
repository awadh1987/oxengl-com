-- Migration: Enforce ON DELETE CASCADE across all multi-tenant foreign keys
-- Prevents ForeignKeyViolation (violates foreign key constraint "res_users_company_id_fkey" on table "res_users")
-- when purging or deleting tenants and workspace data.

BEGIN;

-- 1. Automatically update all foreign keys pointing to res_companies(id) to ON DELETE CASCADE
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_name, 
            tc.constraint_name, 
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu 
          ON ccu.constraint_name = tc.constraint_name 
         AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints rc 
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'res_companies'
          AND rc.delete_rule != 'CASCADE'
          AND kcu.column_name != 'parent_id'
    ) LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES res_companies(id) ON DELETE CASCADE', r.table_name, r.constraint_name, r.column_name);
        RAISE NOTICE 'Updated constraint % on table % to ON DELETE CASCADE', r.constraint_name, r.table_name;
    END LOOP;
END $$;

-- 2. Update child-to-child foreign key constraints to ON DELETE CASCADE
DO $$
BEGIN
    -- account_move_lines -> account_accounts
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'account_move_lines_account_id_fkey') THEN
        ALTER TABLE account_move_lines DROP CONSTRAINT account_move_lines_account_id_fkey;
        ALTER TABLE account_move_lines ADD CONSTRAINT account_move_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES account_accounts(id) ON DELETE CASCADE;
    END IF;

    -- account_moves -> fiscal_years
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'account_moves_fiscal_year_id_fkey') THEN
        ALTER TABLE account_moves DROP CONSTRAINT account_moves_fiscal_year_id_fkey;
        ALTER TABLE account_moves ADD CONSTRAINT account_moves_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE CASCADE;
    END IF;

    -- account_moves -> account_journals
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'account_moves_journal_id_fkey') THEN
        ALTER TABLE account_moves DROP CONSTRAINT account_moves_journal_id_fkey;
        ALTER TABLE account_moves ADD CONSTRAINT account_moves_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES account_journals(id) ON DELETE CASCADE;
    END IF;

    -- delivery_manifests -> vehicles
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'delivery_manifests_vehicle_id_fkey') THEN
        ALTER TABLE delivery_manifests DROP CONSTRAINT delivery_manifests_vehicle_id_fkey;
        ALTER TABLE delivery_manifests ADD CONSTRAINT delivery_manifests_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
    END IF;

    -- delivery_manifests -> drivers
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'delivery_manifests_driver_id_fkey') THEN
        ALTER TABLE delivery_manifests DROP CONSTRAINT delivery_manifests_driver_id_fkey;
        ALTER TABLE delivery_manifests ADD CONSTRAINT delivery_manifests_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
    END IF;

    -- iot_telemetry_events -> vehicles
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'iot_telemetry_events_vehicle_id_fkey') THEN
        ALTER TABLE iot_telemetry_events DROP CONSTRAINT iot_telemetry_events_vehicle_id_fkey;
        ALTER TABLE iot_telemetry_events ADD CONSTRAINT iot_telemetry_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
    END IF;

    -- journal_lines -> accounts
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'journal_lines_account_id_fkey') THEN
        ALTER TABLE journal_lines DROP CONSTRAINT journal_lines_account_id_fkey;
        ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
    END IF;

    -- landed_cost_items -> materials
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'landed_cost_items_material_id_fkey') THEN
        ALTER TABLE landed_cost_items DROP CONSTRAINT landed_cost_items_material_id_fkey;
        ALTER TABLE landed_cost_items ADD CONSTRAINT landed_cost_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
    END IF;

    -- manifest_stops -> waybills
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'manifest_stops_waybill_id_fkey') THEN
        ALTER TABLE manifest_stops DROP CONSTRAINT manifest_stops_waybill_id_fkey;
        ALTER TABLE manifest_stops ADD CONSTRAINT manifest_stops_waybill_id_fkey FOREIGN KEY (waybill_id) REFERENCES waybills(id) ON DELETE CASCADE;
    END IF;

    -- part_requirements -> product_products
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'part_requirements_product_id_fkey') THEN
        ALTER TABLE part_requirements DROP CONSTRAINT part_requirements_product_id_fkey;
        ALTER TABLE part_requirements ADD CONSTRAINT part_requirements_product_id_fkey FOREIGN KEY (product_id) REFERENCES product_products(id) ON DELETE CASCADE;
    END IF;

    -- purchase_orders -> res_partners
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'purchase_orders_partner_id_fkey') THEN
        ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_partner_id_fkey;
        ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES res_partners(id) ON DELETE CASCADE;
    END IF;

    -- stock_items -> product_products
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_items_product_id_fkey') THEN
        ALTER TABLE stock_items DROP CONSTRAINT stock_items_product_id_fkey;
        ALTER TABLE stock_items ADD CONSTRAINT stock_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES product_products(id) ON DELETE CASCADE;
    END IF;

    -- stock_lots -> stock_items
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_lots_stock_item_id_fkey') THEN
        ALTER TABLE stock_lots DROP CONSTRAINT stock_lots_stock_item_id_fkey;
        ALTER TABLE stock_lots ADD CONSTRAINT stock_lots_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
    END IF;

    -- stock_movements -> stock_items
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_movements_stock_item_id_fkey') THEN
        ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_stock_item_id_fkey;
        ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
    END IF;

    -- stock_movements -> warehouses
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_movements_warehouse_id_fkey') THEN
        ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_warehouse_id_fkey;
        ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
    END IF;

    -- stock_moves -> stock_locations (source and dest)
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_moves_location_id_fkey') THEN
        ALTER TABLE stock_moves DROP CONSTRAINT stock_moves_location_id_fkey;
        ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_location_id_fkey FOREIGN KEY (location_id) REFERENCES stock_locations(id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_moves_location_dest_id_fkey') THEN
        ALTER TABLE stock_moves DROP CONSTRAINT stock_moves_location_dest_id_fkey;
        ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_location_dest_id_fkey FOREIGN KEY (location_dest_id) REFERENCES stock_locations(id) ON DELETE CASCADE;
    END IF;

    -- stock_moves -> product_products
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_moves_product_id_fkey') THEN
        ALTER TABLE stock_moves DROP CONSTRAINT stock_moves_product_id_fkey;
        ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_product_id_fkey FOREIGN KEY (product_id) REFERENCES product_products(id) ON DELETE CASCADE;
    END IF;

    -- stock_quants -> product_products & stock_locations
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_quants_product_id_fkey') THEN
        ALTER TABLE stock_quants DROP CONSTRAINT stock_quants_product_id_fkey;
        ALTER TABLE stock_quants ADD CONSTRAINT stock_quants_product_id_fkey FOREIGN KEY (product_id) REFERENCES product_products(id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'stock_quants_location_id_fkey') THEN
        ALTER TABLE stock_quants DROP CONSTRAINT stock_quants_location_id_fkey;
        ALTER TABLE stock_quants ADD CONSTRAINT stock_quants_location_id_fkey FOREIGN KEY (location_id) REFERENCES stock_locations(id) ON DELETE CASCADE;
    END IF;

    -- supplier_invoices -> res_partners
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'supplier_invoices_partner_id_fkey') THEN
        ALTER TABLE supplier_invoices DROP CONSTRAINT supplier_invoices_partner_id_fkey;
        ALTER TABLE supplier_invoices ADD CONSTRAINT supplier_invoices_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES res_partners(id) ON DELETE CASCADE;
    END IF;

    -- supplier_settlements -> account_moves & res_partners
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'supplier_settlements_move_id_fkey') THEN
        ALTER TABLE supplier_settlements DROP CONSTRAINT supplier_settlements_move_id_fkey;
        ALTER TABLE supplier_settlements ADD CONSTRAINT supplier_settlements_move_id_fkey FOREIGN KEY (move_id) REFERENCES account_moves(id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'supplier_settlements_partner_id_fkey') THEN
        ALTER TABLE supplier_settlements DROP CONSTRAINT supplier_settlements_partner_id_fkey;
        ALTER TABLE supplier_settlements ADD CONSTRAINT supplier_settlements_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES res_partners(id) ON DELETE CASCADE;
    END IF;

    -- transporter_ledger -> res_partners
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transporter_ledger_transporter_id_fkey') THEN
        ALTER TABLE transporter_ledger DROP CONSTRAINT transporter_ledger_transporter_id_fkey;
        ALTER TABLE transporter_ledger ADD CONSTRAINT transporter_ledger_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES res_partners(id) ON DELETE CASCADE;
    END IF;

    -- waybills -> purchase_orders
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'waybills_purchase_order_id_fkey') THEN
        ALTER TABLE waybills DROP CONSTRAINT waybills_purchase_order_id_fkey;
        ALTER TABLE waybills ADD CONSTRAINT waybills_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
    END IF;

    -- weighbridge_tickets -> stock_pickings
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'weighbridge_tickets_picking_id_fkey') THEN
        ALTER TABLE weighbridge_tickets DROP CONSTRAINT weighbridge_tickets_picking_id_fkey;
        ALTER TABLE weighbridge_tickets ADD CONSTRAINT weighbridge_tickets_picking_id_fkey FOREIGN KEY (picking_id) REFERENCES stock_pickings(id) ON DELETE CASCADE;
    END IF;

    -- yard_gate_appointments -> warehouses
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'yard_gate_appointments_warehouse_id_fkey') THEN
        ALTER TABLE yard_gate_appointments DROP CONSTRAINT yard_gate_appointments_warehouse_id_fkey;
        ALTER TABLE yard_gate_appointments ADD CONSTRAINT yard_gate_appointments_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;
