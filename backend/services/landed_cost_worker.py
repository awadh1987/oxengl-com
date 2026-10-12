import os
import asyncio
from decimal import Decimal
import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/erp_db")

async def poll_and_process_unfinalized_valuations(conn: asyncpg.Connection, tenant_schema: str):
    """
    Scans the data layers of an isolated schema to discover shipments 
    awaiting proportional landed cost distribution adjustments.
    """
    # Force localized transaction boundary boundaries
    await conn.execute(f"SET search_path TO {tenant_schema}, public;")
    
    # Locate unfinalized raw material shipments utilizing our partial indexes
    pending_manifests_query = """
        SELECT DISTINCT shipping_manifest_id 
        FROM inventory_valuation_ledger 
        WHERE is_valuation_finalized = false AND shipping_manifest_id IS NOT NULL;
    """
    manifest_rows = await conn.fetch(pending_manifests_query)
    
    for row in manifest_rows:
        manifest_id = row["shipping_manifest_id"]
        print(f"  🚛 Found active shipment awaiting processing. Manifest ID: {manifest_id}")
        
        # Simulating inbound freight overhead totals derived from our procurement invoices mapping
        # In a full-scale run, these metrics are extracted from your vendor bill tables
        mock_freight_charges = Decimal("4500.0000")
        mock_customs_duties = Decimal("1850.5000")
        
        # Build an execution adapter bridge to map onto our database session context structure
        # Since LandedCostAllocationEngine expects an SQLAlchemy session, we execute direct atomic queries here
        # or map onto an internal transactional session maker block:
        try:
            # Aggregate total mass mass values associated with this manifest run
            mass_query = "SELECT SUM(primary_quantity) FROM inventory_valuation_ledger WHERE shipping_manifest_id = $1;"
            total_mass = await conn.fetchval(mass_query, manifest_id)
            
            if not total_mass or total_mass == 0:
                continue
                
            total_overhead = mock_freight_charges + mock_customs_duties
            
            # Fetch individual batches for apportionment calculation loops
            batch_query = "SELECT id, primary_quantity FROM inventory_valuation_ledger WHERE shipping_manifest_id = $1;"
            batches = await conn.fetch(batch_query, manifest_id)
            
            async with conn.transaction():
                for batch in batches:
                    batch_id = batch["id"]
                    batch_mass = Decimal(str(batch["primary_quantity"]))
                    
                    # Apportion overhead by dividing batch mass by total shipment weight
                    apportioned_overhead = Decimal(f"{total_overhead * (batch_mass / Decimal(str(total_mass))):.4f}")
                    unit_adjustment = Decimal(f"{apportioned_overhead / batch_mass:.4f}")
                    
                    # Persist final audited asset valuation parameters to disk
                    await conn.execute("""
                        UPDATE inventory_valuation_ledger
                        SET distributed_landed_overhead = $1,
                            unit_landed_cost_adjustment = $2,
                            is_valuation_finalized = true
                        WHERE id = $3;
                    """, apportioned_overhead, unit_adjustment, batch_id)
                    
            print(f"  ✅ Completed proportional valuation balance split for Manifest: {manifest_id}")
            
        except Exception as batch_error:
            print(f"  ❌ Operational variance processing failure on batch {manifest_id}: {str(batch_error)}")

async def run_landed_cost_daemon():
    """Continuous worker daemon polling isolated database boundaries for incoming raw material shipments."""
    print("🚀 Initializing OxenGL Landed Cost Background Allocation Worker...")
    
    while True:
        conn = None
        try:
            # Open connection straight onto the local storage proxy
            conn = await asyncpg.connect(DATABASE_URL)
            
            # Query global public registry to gather valid customer workspaces
            active_tenants = await conn.fetch("SELECT schema_name FROM public.tenants WHERE is_active = true;")
            
            for tenant in active_tenants:
                schema_name = tenant["schema_name"]
                await poll_and_process_unfinalized_valuations(conn, schema_name)
                
        except Exception as global_loop_error:
            print(f"⚠️  [Landed Cost Daemon] Operational processing anomaly: {str(global_loop_error)}")
        finally:
            if conn:
                await conn.close()
                
        # Hibernate processing loop for 30 seconds before executing the next check cycle
        await asyncio.sleep(30)

if __name__ == "__main__":
    asyncio.run(run_landed_cost_daemon())
