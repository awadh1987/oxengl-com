import pytest
import uuid
from decimal import Decimal
from app.services.optimization_service import IoTRouteOptimizationEngine
from app.domains.logistics.phase4_models import DeliveryManifest, ManifestStop
from app.domains.logistics.models import Waybill

@pytest.mark.asyncio
async def test_opt_01_greedy_sequence_correctness(db_session):
    """OPT-01: Verifies greedy algorithm accurately sorts coordinates by shortest distance."""
    tenant_id = uuid.uuid4()
    manifest_id = uuid.uuid4()
    
    # 1. Create parent manifest record
    manifest = DeliveryManifest(id=manifest_id, tenant_id=tenant_id, manifest_number="MNF-TEST-OPT", status="DRAFT")
    db_session.add(manifest)
    
    # 2. Inject two mock waybills (Stop 1: Close node, Stop 2: Far node)
    wb_close_id = uuid.uuid4()
    wb_close = Waybill(id=wb_close_id, tenant_id=tenant_id, waybill_number="WB-CLOSE", dest_lat=Decimal("15.4000"), dest_lng=Decimal("44.2500"), cargo_weight_ton=10.0, origin_warehouse_id=uuid.uuid4(), destination_warehouse_id=uuid.uuid4())
    
    wb_far_id = uuid.uuid4()
    wb_far = Waybill(id=wb_far_id, tenant_id=tenant_id, waybill_number="WB-FAR", dest_lat=Decimal("16.5000"), dest_lng=Decimal("45.8000"), cargo_weight_ton=12.0, origin_warehouse_id=uuid.uuid4(), destination_warehouse_id=uuid.uuid4())
    
    db_session.add_all([wb_close, wb_far])
    await db_session.flush()
    
    # 3. Associate stops to the parent manifest container
    stop_close = ManifestStop(id=uuid.uuid4(), manifest_id=manifest_id, waybill_id=wb_close_id, sequence_order=0, status="PENDING")
    stop_far = ManifestStop(id=uuid.uuid4(), manifest_id=manifest_id, waybill_id=wb_far_id, sequence_order=0, status="PENDING")
    db_session.add_all([stop_close, stop_far])
    await db_session.commit()
    
    # 4. Invoke optimizer from an origin anchor point (Sanaa Baseline: 15.3562, 44.2081)
    result = await IoTRouteOptimizationEngine.optimize_manifest_routing_sequence(
        db=db_session, tenant_id=tenant_id, manifest_id=manifest_id, origin_lat=15.3562, origin_lng=44.2081
    )
    
    assert result["status"] == "OPTIMIZED"
    assert result["total_stops_sequenced"] == 2
    assert result["calculated_distance_km"] > 0
    
    # 5. Confirm that the closest coordinate was accurately given priority Sequence 1
    updated_stop_close = await db_session.get(ManifestStop, stop_close.id)
    updated_stop_far = await db_session.get(ManifestStop, stop_far.id)
    assert updated_stop_close.sequence_order == 1
    assert updated_stop_far.sequence_order == 2
