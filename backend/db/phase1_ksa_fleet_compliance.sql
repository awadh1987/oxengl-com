-- OxenGL KSA Fleet Compliance Upgrade - Phase 1 Schema Expansion
-- Strictly Additive Schema Migration

-- 1. Extend the Drivers Table
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS iqama_number VARCHAR(15),
  ADD COLUMN IF NOT EXISTS iqama_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS professional_card_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS professional_card_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS tga_medical_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS gosi_linked BOOLEAN DEFAULT FALSE;

-- 2. Extend the Vehicles Table
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS traffic_sequence_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS plate_letters VARCHAR(10),
  ADD COLUMN IF NOT EXISTS plate_numbers VARCHAR(4),
  ADD COLUMN IF NOT EXISTS istimara_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS naql_card_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS activity_type VARCHAR(50);

-- 3. Create Performance Indexes for Daily Compliance Queries
CREATE INDEX IF NOT EXISTS idx_vehicle_expiries ON public.vehicles(naql_card_expiry_date, istimara_expiry_date);
CREATE INDEX IF NOT EXISTS idx_driver_expiries ON public.drivers(iqama_expiry_date, professional_card_expiry_date);
