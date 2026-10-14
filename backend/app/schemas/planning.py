"""
Pydantic v2 Schemas for the OxenGL Planning-First Core Spine (`core_projects`).

Provides:
1. Polymorphic `metadata_json` schemas and dynamic validation by `project_type`
   (`logistics`, `supply_chain`, `humanitarian_supply`, `epc`, `oil_gas`,
   `commercial_agribusiness`).
2. Strict request/response schemas for Project CRUD (`CoreProjectCreate`,
   `CoreProjectUpdate`, `CoreProjectRead`).
3. Recursive Work Breakdown Structure (WBS) tree schemas (`CoreProjectWBSNode`,
   `CoreProjectWBSResponse`).
4. Command Center Telemetry & Financial/Operational Roll-Up Aggregator schemas
   (`ProjectTelemetryResponse`, `BudgetVsActualTelemetry`, `ActiveFleetTelemetry`,
   `StockReservationTelemetry`, `ESGAndIoTTelemetry`).
"""
from __future__ import annotations

import sys
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional, Type

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

sys.modules.setdefault("app.schemas.planning", sys.modules[__name__])
sys.modules.setdefault("backend.app.schemas.planning", sys.modules[__name__])

try:
    from backend.app.models.planning import ProjectStatus, ProjectType
except ImportError:
    from app.models.planning import ProjectStatus, ProjectType


# ==============================================================================
# 1. Polymorphic `metadata_json` Schemas by `ProjectType`
# ==============================================================================

class LogisticsMetadata(BaseModel):
    """Metadata schema for `logistics` (Multi-modal transport, CFS, heavy haulage, customs)."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    transport_mode: Optional[Literal["road", "sea", "air", "rail", "multi_modal"]] = None
    origin_hub: Optional[str] = None
    destination_hub: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    route_corridor: Optional[str] = None
    customs_regime: Optional[str] = None
    container_count: Optional[int] = Field(default=None, ge=0)
    fleet_allocation_count: Optional[int] = Field(default=None, ge=0)
    cargo_classification: Optional[str] = None
    cargo_type: Optional[str] = None
    estimated_distance_km: Optional[float] = Field(default=None, ge=0.0)
    vehicle_requirements: Optional[List[str]] = None
    sla_target_hours: Optional[float] = Field(default=None, ge=0.0)
    max_payload_tons: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    cold_chain_required: Optional[bool] = None
    beneficiary_client_ref: Optional[str] = None
    custom_attributes: Optional[Dict[str, Any]] = None

    @model_validator(mode="after")
    def _validate_logistics_corridor(self) -> "LogisticsMetadata":
        if (self.origin_hub and not self.destination_hub) or (
            self.destination_hub and not self.origin_hub
        ):
            raise ValueError(
                "Both origin_hub and destination_hub must be provided together when specifying a logistics hub pair."
            )
        return self


class SupplyChainMetadata(BaseModel):
    """Metadata schema for `supply_chain` (GCC mega-project materials, rations, fuel/energy)."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    origin_hub: Optional[str] = None
    destination_hub: Optional[str] = None
    commodity_category: Optional[str] = None
    incoterms: Optional[str] = None
    lead_time_days: Optional[int] = Field(default=None, ge=0)
    warehouse_hub: Optional[str] = None
    materials_list: Optional[List[str]] = None
    safety_stock_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    beneficiary_client_ref: Optional[str] = None
    custom_attributes: Optional[Dict[str, Any]] = None


class HumanitarianSupplyMetadata(BaseModel):
    """Metadata schema for `humanitarian_supply` (WFP, WHO, UNICEF emergency relief)."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    donor_agency: Optional[str] = None
    donor_organization: Optional[str] = None
    donor_grant_code: Optional[str] = None
    grant_code: Optional[str] = None
    cluster_sector: Optional[str] = None
    relief_cluster: Optional[str] = None
    grant_reference: Optional[str] = None
    distribution_region: Optional[str] = None
    target_demographics: Optional[str] = None
    target_beneficiaries: Optional[int] = Field(default=None, ge=0)
    target_beneficiaries_count: Optional[int] = Field(default=None, ge=0)
    distribution_camps: Optional[List[str]] = None
    customs_exemption_ref: Optional[str] = None
    last_mile_audit_required: Optional[bool] = True
    beneficiary_client_ref: Optional[str] = None
    custom_attributes: Optional[Dict[str, Any]] = None


class EpcMetadata(BaseModel):
    """Metadata schema for `epc` (Engineering, Procurement & Construction infrastructure)."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    contract_type: Optional[str] = None
    contractor_tier: Optional[str] = None
    site_code: Optional[str] = None
    retention_percentage: Optional[Decimal] = Field(
        default=None, ge=Decimal("0"), le=Decimal("100")
    )
    defect_liability_months: Optional[int] = Field(default=None, ge=0)
    site_location: Optional[str] = None
    prime_contractor: Optional[str] = None
    subcontractors: Optional[List[str]] = None
    wbs_phases: Optional[List[str]] = None
    beneficiary_client_ref: Optional[str] = None
    custom_attributes: Optional[Dict[str, Any]] = None


class OilGasMetadata(BaseModel):
    """Metadata schema for `oil_gas` (Upstream/downstream rig provisioning & HazMat)."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    field_stream: Optional[Literal["upstream", "midstream", "downstream", "integrated"]] = None
    well_block_id: Optional[str] = None
    rig_identifier: Optional[str] = None
    rig_code: Optional[str] = None
    hazmat_classification: Optional[str] = None
    hazmat_class: Optional[str] = None
    hse_compliance_tier: Optional[str] = None
    hse_clearance_level: Optional[str] = None
    well_count: Optional[int] = Field(default=None, ge=0)
    daily_barrel_target: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    beneficiary_client_ref: Optional[str] = None
    custom_attributes: Optional[Dict[str, Any]] = None


class CommercialAgribusinessMetadata(BaseModel):
    """Metadata schema for `commercial_agribusiness` (Crop cycles, BOM manufacturing, cold-chain)."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    crop_or_product_line: Optional[str] = None
    crop_commodity: Optional[str] = None
    harvest_season: Optional[str] = None
    hectares_area: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    cold_chain_required: Optional[bool] = None
    cycle_duration_days: Optional[int] = Field(default=None, ge=0)
    cold_chain_min_temp_c: Optional[float] = None
    cold_chain_max_temp_c: Optional[float] = None
    bom_reference: Optional[str] = None
    expected_yield_tons: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    beneficiary_client_ref: Optional[str] = None
    custom_attributes: Optional[Dict[str, Any]] = None

    @model_validator(mode="after")
    def _validate_temperature_bounds(self) -> "CommercialAgribusinessMetadata":
        if (
            self.cold_chain_min_temp_c is not None
            and self.cold_chain_max_temp_c is not None
            and self.cold_chain_min_temp_c > self.cold_chain_max_temp_c
        ):
            raise ValueError(
                "cold_chain_min_temp_c cannot be greater than cold_chain_max_temp_c"
            )
        return self


METADATA_SCHEMA_REGISTRY: Dict[ProjectType, Type[BaseModel]] = {
    ProjectType.LOGISTICS: LogisticsMetadata,
    ProjectType.SUPPLY_CHAIN: SupplyChainMetadata,
    ProjectType.HUMANITARIAN_SUPPLY: HumanitarianSupplyMetadata,
    ProjectType.EPC: EpcMetadata,
    ProjectType.OIL_GAS: OilGasMetadata,
    ProjectType.COMMERCIAL_AGRIBUSINESS: CommercialAgribusinessMetadata,
}


def validate_metadata_for_project_type(
    project_type: ProjectType | str,
    metadata_json: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Dynamically validates `metadata_json` against the polymorphic schema registered
    for `project_type`.
    """
    if metadata_json is None:
        return {}
    if not isinstance(metadata_json, dict):
        raise ValueError("metadata_json must be a valid JSON object (dict)")

    resolved_type = (
        project_type
        if isinstance(project_type, ProjectType)
        else ProjectType(str(project_type).strip().lower())
    )
    schema_cls = METADATA_SCHEMA_REGISTRY.get(resolved_type)
    if schema_cls is None:
        raise ValueError(f"Unsupported project_type for metadata validation: {project_type}")

    validated = schema_cls.model_validate(metadata_json)
    return validated.model_dump(mode="json", exclude_none=True)


# ==============================================================================
# 2. Project CRUD Request & Response Schemas
# ==============================================================================

class PartnerBrief(BaseModel):
    """Lightweight representation of a linked Client or Beneficiary (`res_partners`)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    partner_type: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class CoreProjectBase(BaseModel):
    """Shared attributes for `CoreProject` creation and representation."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="ignore")

    name: Optional[str] = Field(
        default=None,
        max_length=255,
        validation_alias=AliasChoices("name", "project_name"),
        description="Human-readable title of the project or WBS phase/deliverable.",
    )
    project_code: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Unique sequential project code per tenant (e.g., PRJ-WFP-2026-001). Auto-generated if omitted.",
    )
    project_type: ProjectType = Field(
        ...,
        description="Polymorphic project classification driving metadata validation.",
    )
    parent_project_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Optional parent CoreProject UUID for hierarchical WBS nesting.",
    )
    client_id: Optional[uuid.UUID] = Field(
        default=None,
        description="FK to res_partners representing the contracting client or donor agency.",
    )
    beneficiary_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Optional FK to res_partners representing the end recipient, IDP camp, or facility.",
    )
    status: ProjectStatus = Field(
        default=ProjectStatus.DRAFT,
        description="Current execution lifecycle state of the project.",
    )
    financial_envelope: Decimal = Field(
        default=Decimal("0.0000"),
        ge=Decimal("0"),
        validation_alias=AliasChoices("financial_envelope", "total_budget"),
        description="Hard budget ceiling allocated to this project node.",
    )
    metadata_json: Dict[str, Any] = Field(
        default_factory=dict,
        description="Dynamic JSONB payload validated polymorphically based on project_type.",
    )
    telemetry_data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Live IoT sensor states, cold-chain readings, and GPS ping snapshots.",
    )
    esg_metrics: Dict[str, Any] = Field(
        default_factory=dict,
        description="Scope 1, 2, and 3 carbon footprint and sustainability compliance metrics.",
    )

    @field_validator("project_type", mode="before")
    @classmethod
    def _normalize_project_type(cls, v: Any) -> ProjectType:
        if isinstance(v, ProjectType):
            return v
        if isinstance(v, str):
            cleaned = v.strip().lower()
            return ProjectType(cleaned)
        raise ValueError(f"Invalid project_type: {v}")

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, v: Any) -> ProjectStatus:
        return normalize_project_status(v)


_STATUS_ALIASES: Dict[str, ProjectStatus] = {
    "draft": ProjectStatus.DRAFT,
    "planning": ProjectStatus.PLANNING,
    "active": ProjectStatus.ACTIVE_EXECUTION,
    "active execution": ProjectStatus.ACTIVE_EXECUTION,
    "active_execution": ProjectStatus.ACTIVE_EXECUTION,
    "in_progress": ProjectStatus.ACTIVE_EXECUTION,
    "in progress": ProjectStatus.ACTIVE_EXECUTION,
    "suspended": ProjectStatus.SUSPENDED,
    "on_hold": ProjectStatus.SUSPENDED,
    "on hold": ProjectStatus.SUSPENDED,
    "completed": ProjectStatus.COMPLETED,
    "closed": ProjectStatus.CLOSED,
    "cancelled": ProjectStatus.CLOSED,
    "canceled": ProjectStatus.CLOSED,
    "audited": ProjectStatus.AUDITED,
    "approved": ProjectStatus.AUDITED,
}


def normalize_project_status(value: Any) -> ProjectStatus:
    """
    Normalize a raw status string or `ProjectStatus` enum case-insensitively.
    Maps aliases such as `'active'` or `'active execution'` to `ProjectStatus.ACTIVE_EXECUTION`.
    """
    if isinstance(value, ProjectStatus):
        return value
    if isinstance(value, str):
        cleaned = value.strip()
        lowered = cleaned.lower()
        if lowered in ("active", "active execution"):
            return ProjectStatus.ACTIVE_EXECUTION
        if lowered in _STATUS_ALIASES:
            return _STATUS_ALIASES[lowered]
        for member in ProjectStatus:
            if member.value.lower() == lowered or member.name.lower() == lowered:
                return member
        return ProjectStatus(cleaned)
    raise ValueError(f"Invalid status: {value}")


def get_status_search_variants(
    status_enum: ProjectStatus, raw_value: Optional[str] = None
) -> List[str]:
    """
    Return all lowercase string representations that should match `status_enum`
    when filtering `CoreProject.status` case-insensitively in SQL.
    """
    variants = {
        status_enum.value.lower(),
        status_enum.name.lower(),
        status_enum.name.lower().replace("_", " "),
    }
    for alias_key, mapped in _STATUS_ALIASES.items():
        if mapped == status_enum:
            variants.add(alias_key.lower())
    if raw_value and raw_value.strip():
        variants.add(raw_value.strip().lower())
    return sorted(variants)


class CoreProjectCreate(CoreProjectBase):
    """Payload for `POST /api/v1/planning/projects`."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="ignore")

    @model_validator(mode="after")
    def _validate_polymorphic_metadata(self) -> "CoreProjectCreate":
        self.metadata_json = validate_metadata_for_project_type(
            self.project_type, self.metadata_json
        )
        return self


class CoreProjectUpdate(BaseModel):
    """Payload for `PUT /api/v1/planning/projects/{project_id}`."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="ignore")

    name: Optional[str] = Field(
        default=None,
        max_length=255,
        validation_alias=AliasChoices("name", "project_name"),
    )
    project_code: Optional[str] = Field(default=None, max_length=64)
    project_type: Optional[ProjectType] = None
    parent_project_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None
    beneficiary_id: Optional[uuid.UUID] = None
    status: Optional[ProjectStatus] = None
    financial_envelope: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        validation_alias=AliasChoices("financial_envelope", "total_budget"),
    )
    metadata_json: Optional[Dict[str, Any]] = None
    telemetry_data: Optional[Dict[str, Any]] = None
    esg_metrics: Optional[Dict[str, Any]] = None

    @field_validator("project_type", mode="before")
    @classmethod
    def _normalize_project_type(cls, v: Any) -> Optional[ProjectType]:
        if v is None:
            return None
        if isinstance(v, ProjectType):
            return v
        if isinstance(v, str):
            return ProjectType(v.strip().lower())
        raise ValueError(f"Invalid project_type: {v}")

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, v: Any) -> Optional[ProjectStatus]:
        if v is None:
            return None
        return normalize_project_status(v)

    @model_validator(mode="after")
    def _validate_polymorphic_metadata_if_type_present(self) -> "CoreProjectUpdate":
        if self.metadata_json is not None and self.project_type is not None:
            self.metadata_json = validate_metadata_for_project_type(
                self.project_type, self.metadata_json
            )
        return self


class CoreProjectRead(BaseModel):
    """Response schema for a `CoreProject` resource."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    parent_project_id: Optional[uuid.UUID] = None
    project_code: str
    name: Optional[str] = None
    project_type: ProjectType
    client_id: Optional[uuid.UUID] = None
    beneficiary_id: Optional[uuid.UUID] = None
    status: ProjectStatus
    financial_envelope: Decimal
    metadata_json: Dict[str, Any] = Field(default_factory=dict)
    telemetry_data: Dict[str, Any] = Field(default_factory=dict)
    esg_metrics: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    client: Optional[PartnerBrief] = None
    beneficiary: Optional[PartnerBrief] = None
    sub_project_count: int = 0

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, v: Any) -> ProjectStatus:
        return normalize_project_status(v)


# ==============================================================================
# 3. Hierarchical WBS Schemas (`GET /api/v1/planning/projects/{project_id}/wbs`)
# ==============================================================================

class CoreProjectWBSNode(BaseModel):
    """Recursive WBS node representing a project and its nested sub-projects."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    parent_project_id: Optional[uuid.UUID] = None
    project_code: str
    name: Optional[str] = None
    project_type: ProjectType
    status: ProjectStatus
    client_id: Optional[uuid.UUID] = None
    beneficiary_id: Optional[uuid.UUID] = None
    client: Optional[PartnerBrief] = None
    beneficiary: Optional[PartnerBrief] = None
    financial_envelope: Decimal
    direct_financial_envelope: Decimal
    rolled_up_financial_envelope: Decimal
    wbs_level: int = 0
    wbs_path: List[str] = Field(default_factory=list)
    sub_project_count: int = 0
    total_descendant_count: int = 0
    metadata_json: Dict[str, Any] = Field(default_factory=dict)
    telemetry_data: Dict[str, Any] = Field(default_factory=dict)
    esg_metrics: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    sub_projects: List["CoreProjectWBSNode"] = Field(default_factory=list)

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, v: Any) -> ProjectStatus:
        return normalize_project_status(v)


class CoreProjectWBSResponse(CoreProjectWBSNode):
    """
    Top-level response for `GET /api/v1/planning/projects/{project_id}/wbs`.
    Inherits all root `CoreProjectWBSNode` fields (including `sub_projects`)
    and adds tree-wide summary metrics (`total_tree_nodes`, `max_depth`).
    """
    total_tree_nodes: int = 1
    max_depth: int = 0


CoreProjectWBSNode.model_rebuild()
CoreProjectWBSResponse.model_rebuild()


# ==============================================================================
# 4. Command Center Telemetry & Aggregator Schemas
#    (`GET /api/v1/planning/projects/{project_id}/telemetry`)
# ==============================================================================

class BudgetVsActualTelemetry(BaseModel):
    """GL & Procurement financial roll-up against the project's financial envelope."""
    model_config = ConfigDict(from_attributes=True)

    direct_budget: Decimal = Decimal("0.0000")
    total_budget: Decimal = Decimal("0.0000")
    actual_gl_debit: Decimal = Decimal("0.0000")
    actual_gl_credit: Decimal = Decimal("0.0000")
    actual_gl_expenses: Decimal = Decimal("0.0000")
    actual_trip_costs: Decimal = Decimal("0.0000")
    total_actual_expenses: Decimal = Decimal("0.0000")
    committed_po_amount: Decimal = Decimal("0.0000")
    total_committed_and_actual: Decimal = Decimal("0.0000")
    remaining_budget: Decimal = Decimal("0.0000")
    budget_variance: Decimal = Decimal("0.0000")
    budget_utilization_pct: float = 0.0
    is_over_budget: bool = False
    journal_entry_count: int = 0
    purchase_order_count: int = 0
    sale_order_count: int = 0
    sale_order_revenue: Decimal = Decimal("0.0000")


class ActiveFleetTelemetry(BaseModel):
    """Logistics & Fleet execution roll-up for the project tree."""
    model_config = ConfigDict(from_attributes=True)

    total_trips: int = 0
    active_trips: int = 0
    completed_trips: int = 0
    cancelled_trips: int = 0
    total_distance_km: Decimal = Decimal("0.00")
    total_fuel_consumed_liters: Decimal = Decimal("0.00")
    total_driver_hours: Decimal = Decimal("0.00")
    total_planned_weight_tons: Decimal = Decimal("0.0000")
    status_breakdown: Dict[str, int] = Field(default_factory=dict)
    active_trip_pings: List[Dict[str, Any]] = Field(default_factory=list)


class StockReservationTelemetry(BaseModel):
    """Inventory ring-fencing, stock pickings, and warehouse movement roll-up."""
    model_config = ConfigDict(from_attributes=True)

    total_pickings: int = 0
    active_reservations: int = 0
    completed_pickings: int = 0
    cancelled_pickings: int = 0
    reserved_quantity: Decimal = Decimal("0.0000")
    dispatched_quantity: Decimal = Decimal("0.0000")
    stock_movement_count: int = 0
    stock_movement_quantity: Decimal = Decimal("0.0000")
    stock_movement_valuation: Decimal = Decimal("0.0000")
    picking_status_breakdown: Dict[str, int] = Field(default_factory=dict)


class ESGAndIoTTelemetry(BaseModel):
    """IoT sensor states and automated Scope 1/2/3 carbon accounting summary."""
    model_config = ConfigDict(from_attributes=True)

    telemetry_data: Dict[str, Any] = Field(default_factory=dict)
    esg_metrics: Dict[str, Any] = Field(default_factory=dict)
    estimated_scope1_co2_kg: Decimal = Decimal("0.00")


class ProjectTelemetryResponse(BaseModel):
    """
    Unified Command Center Aggregator payload returned by
    `GET /api/v1/planning/projects/{project_id}/telemetry`.
    """
    model_config = ConfigDict(from_attributes=True)

    project_id: uuid.UUID
    tenant_id: uuid.UUID
    project_code: str
    name: Optional[str] = None
    project_type: ProjectType
    status: ProjectStatus
    include_sub_projects: bool = True
    scoped_project_ids: List[uuid.UUID] = Field(default_factory=list)

    # Top-level KPI convenience fields for instant dashboard binding
    total_budget: Decimal = Decimal("0.0000")
    actual_expenses: Decimal = Decimal("0.0000")
    committed_po_amount: Decimal = Decimal("0.0000")
    remaining_budget: Decimal = Decimal("0.0000")
    budget_utilization_pct: float = 0.0
    active_fleet_trips: int = 0
    stock_reservations_count: int = 0

    # Domain-segmented breakdown payloads
    budget_vs_actual: BudgetVsActualTelemetry
    active_fleet: ActiveFleetTelemetry
    stock_reservations: StockReservationTelemetry
    esg_and_iot: ESGAndIoTTelemetry

    generated_at: datetime

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, v: Any) -> ProjectStatus:
        return normalize_project_status(v)


__all__ = [
    "ProjectType",
    "ProjectStatus",
    "normalize_project_status",
    "get_status_search_variants",
    "LogisticsMetadata",
    "SupplyChainMetadata",
    "HumanitarianSupplyMetadata",
    "EpcMetadata",
    "OilGasMetadata",
    "CommercialAgribusinessMetadata",
    "METADATA_SCHEMA_REGISTRY",
    "validate_metadata_for_project_type",
    "PartnerBrief",
    "CoreProjectBase",
    "CoreProjectCreate",
    "CoreProjectUpdate",
    "CoreProjectRead",
    "CoreProjectWBSNode",
    "CoreProjectWBSResponse",
    "BudgetVsActualTelemetry",
    "ActiveFleetTelemetry",
    "StockReservationTelemetry",
    "ESGAndIoTTelemetry",
    "ProjectTelemetryResponse",
]
