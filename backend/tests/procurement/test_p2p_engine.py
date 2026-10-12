"""
Tests for the Autonomous P2P Three-Way Matching Engine.
Validates the ThreeWayMatchingEngine against demo data with configurable tolerances.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from backend.app.domains.procurement.p2p import (
    ThreeWayMatchingEngine,
    P2PMatchConfig,
    execute_p2p_match,
)


def test_match_all_demo_records():
    """Test matching all demo P2P records returns expected results."""
    results = ThreeWayMatchingEngine.match_from_demo(po_reference="ALL")
    assert len(results) == 5, f"Expected 5 match results, got {len(results)}"
    
    # Verify statuses
    matched = [r for r in results if r.overall_status == "MATCHED"]
    on_hold = [r for r in results if r.overall_status == "HOLD_DISCREPANCY"]
    assert len(matched) == 2, f"Expected 2 matched, got {len(matched)}"
    assert len(on_hold) == 3, f"Expected 3 on hold, got {len(on_hold)}"
    print(f"✅ All demo records matched: {len(matched)} MATCHED, {len(on_hold)} HOLD")


def test_match_specific_po():
    """Test matching a specific PO by reference."""
    results = ThreeWayMatchingEngine.match_from_demo(po_reference="Qiddiya")
    assert len(results) == 1
    assert results[0].po_number == "PO-2026-09-QID001"
    assert results[0].overall_status == "HOLD_DISCREPANCY"
    assert results[0].match_confidence == 90.0
    assert len(results[0].discrepancy_flags) == 1
    assert results[0].discrepancy_flags[0].category == "QTY_SHORT"
    print(f"✅ Qiddiya PO matched: {results[0].overall_status}, Confidence: {results[0].match_confidence}%")


def test_matched_po_has_100_confidence():
    """Test that a fully matched PO gets 100% confidence."""
    results = ThreeWayMatchingEngine.match_from_demo(po_reference="KHJ")
    assert len(results) == 1
    assert results[0].overall_status == "MATCHED"
    assert results[0].match_confidence == 100.0
    assert len(results[0].discrepancy_flags) == 0
    assert results[0].qty_fill_rate == 100.0
    print(f"✅ Al-Kharj PO fully matched: confidence={results[0].match_confidence}%, fill_rate={results[0].qty_fill_rate}%")


def test_price_over_detection():
    """Test that price over-charges are detected."""
    results = ThreeWayMatchingEngine.match_from_demo(po_reference="NEO")
    assert len(results) == 1
    r = results[0]
    assert r.overall_status == "HOLD_DISCREPANCY"
    price_flags = [f for f in r.discrepancy_flags if f.category == "PRICE_OVER"]
    assert len(price_flags) >= 1, "Expected at least 1 PRICE_OVER flag for NEOM"
    assert any(f.severity in ("WARNING", "CRITICAL") for f in price_flags)
    print(f"✅ NEOM price over-charge detected: {len(price_flags)} PRICE_OVER flags, confidence={r.match_confidence}%")


def test_configurable_tolerance():
    """Test that increasing tolerance converts holds to matches."""
    strict_config = P2PMatchConfig(price_tolerance_pct=0.0, qty_tolerance_pct=0.0)
    loose_config = P2PMatchConfig(price_tolerance_pct=10.0, qty_tolerance_pct=10.0)
    
    strict_results = ThreeWayMatchingEngine.match_from_demo(config=strict_config)
    loose_results = ThreeWayMatchingEngine.match_from_demo(config=loose_config)
    
    strict_holds = sum(1 for r in strict_results if r.overall_status == "HOLD_DISCREPANCY")
    loose_holds = sum(1 for r in loose_results if r.overall_status == "HOLD_DISCREPANCY")
    
    assert loose_holds <= strict_holds, f"Loose tolerance should have fewer holds: strict={strict_holds}, loose={loose_holds}"
    print(f"✅ Tolerance impact: strict={strict_holds} holds, loose={loose_holds} holds")


def test_execute_p2p_match_entrypoint():
    """Test the LangGraph-callable entrypoint."""
    result = execute_p2p_match(po_reference="ALL", price_tolerance=2.0)
    assert "match_results" in result
    assert "summary" in result
    assert "audit_narrative" in result
    assert result["summary"]["total_orders"] == 5
    assert result["summary"]["matched"] == 2
    assert result["summary"]["on_hold"] == 3
    print(f"✅ Entrypoint: {result['summary']['total_orders']} orders, narrative length={len(result['audit_narrative'])} chars")


def test_line_level_detail():
    """Test that line-level match details are correct."""
    results = ThreeWayMatchingEngine.match_from_demo(po_reference="JED")
    assert len(results) == 1
    r = results[0]
    assert len(r.line_matches) == 2
    
    # Line 1: Steel H-Beam should have both QTY_SHORT and PRICE_OVER
    line1 = r.line_matches[0]
    assert line1.description == "Structural Steel H-Beam 300x300"
    assert line1.status in ["HOLD", "PRICE_OVER", "QTY_SHORT"]
    assert line1.qty_variance < 0  # Short-shipped
    assert line1.price_variance > 0  # Over-priced
    
    # Line 2: Welding Rods should be MATCHED
    line2 = r.line_matches[1]
    assert line2.status == "MATCHED"
    assert line2.qty_variance == 0
    assert line2.price_variance == 0
    print(f"✅ Line-level detail verified: Line 1 status={line1.status}, Line 2 status={line2.status}")


if __name__ == "__main__":
    print("=" * 60)
    print("  P2P Three-Way Matching Engine — Test Suite")
    print("=" * 60)
    test_match_all_demo_records()
    test_match_specific_po()
    test_matched_po_has_100_confidence()
    test_price_over_detection()
    test_configurable_tolerance()
    test_execute_p2p_match_entrypoint()
    test_line_level_detail()
    print("=" * 60)
    print("  ALL TESTS PASSED ✅")
    print("=" * 60)
