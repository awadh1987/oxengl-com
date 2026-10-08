# OxenGL Phase 1 Spec: Frontend Navigation & Backend Route Controllers
**Target Role:** Principal Software Architect, Full-Stack Security Engineer, UI/UX Lead
**Objective:** Deploy the core backend route controllers inside `backend/app/api/v1/` to enforce ABAC security filters and Three-Way Matching logic, and implement the permission-guarded Next.js sidebar navigation at `frontend/src/components/Navigation.tsx`.

---

## LAYER 1: BACKEND ROUTE CONTROLLERS MAPPING
Implement the core asynchronous routers to handle procurement workflows, financial postings, and data-level isolation filters.

### 1. Procurement & S2P Route Handler (`backend/app/api/v1/procurement.py`)
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.security.abac import enforce_abac

router = APIRouter()

@router.post("/requisitions", status_code=status.HTTP_201_CREATED)
async def create_purchase_requisition(payload: dict, db: AsyncSession = Depends(get_db)):
    return {"id": "PR-2026-00125", "status": "Draft"}

@router.post("/vendor-invoices/match", status_code=status.HTTP_200_OK)
async def evaluate_three_way_match(payload: dict, db: AsyncSession = Depends(get_db)):
    """Validates ordered quantities (PO) against physically received totals (GRN) and vendor bill items."""
    po_qty = payload.get("po_qty", 100)
    grn_qty = payload.get("grn_qty", 100)
    inv_qty = payload.get("inv_qty", 100)
    
    if po_qty == grn_qty == inv_qty:
        return {"status": "MATCHED", "invoice_no": payload.get("invoice_no")}
    return {"status": "HOLD_DISCREPANCY", "reason": "Quantity mismatch detected across parameters."}
```

### 2. Inventory Scoped Router Interceptor (`backend/app/api/v1/inventory.py`)
```python
from fastapi import APIRouter, Depends, status
from app.security.abac import enforce_abac

router = APIRouter()

@router.post("/adjust", status_code=status.HTTP_200_OK, dependencies=[Depends(enforce_abac("ADJUST"))])
async def apply_stock_adjustment(payload: dict):
    """Enforces dynamic row-level attribute constraints over incoming inventory adjustments."""
    return {"status": "SUCCESS", "adjusted_warehouse_id": payload.get("warehouse_id")}
```

### 3. Finance & Reporting Aggregations (`backend/app/api/v1/finance.py` & `reports.py`)
```python
from fastapi import APIRouter, status, HTTPException
router = APIRouter()

@router.post("/journals", status_code=status.HTTP_201_CREATED)
async def post_journal_entry(payload: dict):
    debits = sum(line.get("debit", 0.0) for line in payload.get("lines", []))
    credits = sum(line.get("credit", 0.0) for line in payload.get("lines", []))
    if debits != credits:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unbalanced Entry")
    return {"status": "POSTED", "entry_id": "JE-2026-0001"}
```

---

## LAYER 2: FRONTEND PERMISSION-GUARDED SIDEBAR LAYOUT
Implement the reactive navigation bar inside the React client layout application container.

### Component Code File: `frontend/src/components/Navigation.tsx`
```tsx
import React from 'react';
import { useSelector } from 'react-redux';

interface NavItem {
  name: string;
  path: string;
  requiredPermission: string;
}

export const Navigation: React.FC = () => {
  // Extract active role scopes from the verified user session token state
  const { user } = useSelector((state: any) => state.auth);
  const userPermissions = user?.permissions || [];

  const navItems: NavItem[] = [
    { name: 'Executive Dashboard', path: '/dashboard', requiredPermission: 'DASHBOARD_READ' },
    { name: 'Approval Queue', path: '/approvals', requiredPermission: 'WORKFLOW_APPROVE' },
    { name: 'Source-to-Pay Procurement', path: '/procurement', requiredPermission: 'PROCUREMENT_READ' },
    { name: 'Inventory Control Matrix', path: '/inventory', requiredPermission: 'INVENTORY_READ' },
    { name: 'General Ledger Finance', path: '/finance', requiredPermission: 'FINANCE_READ' },
    { name: 'Fleet Operations Due', path: '/fleet', requiredPermission: 'FLEET_READ' }
  ];

  return (
    <nav className="w-64 min-h-screen bg-slate-950 border-r border-slate-800 p-4 space-y-2">
      <div className="text-xl font-bold tracking-wider text-blue-500 mb-6 px-2">OxenGL ERP</div>
      <div className="space-y-1">
        {navItems.map((item) => {
          const hasAccess = userPermissions.includes(item.requiredPermission) || userPermissions.includes('*');
          if (!hasAccess) return null;

          return (
            <a
              key={item.path}
              href={item.path}
              className="flex items-center px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-900 hover:text-white transition-colors"
            >
              {item.name}
            </a>
          );
        })}
      </div>
    </nav>
  );
};
```

# Instructions
1. Read the blueprint definitions saved inside `docs/blueprints/navigation_and_api_routers.md`.
2. Generate the backend route controllers cleanly at `backend/app/api/v1/procurement.py`, `inventory.py`, and `finance.py`. Explicitly register and include these sub-routers inside our main entry point `backend/app/main.py`.
3. Build the permission-guarded user interface bar at `frontend/src/components/Navigation.tsx`. 
4. Run validations check loops to verify zero type conflicts or compilation warnings remain active:
   `cd frontend && npm run build`
   `python3 scripts/migration_sanity_check.py`

Confirm complete structural code deployment and layout path readiness.
