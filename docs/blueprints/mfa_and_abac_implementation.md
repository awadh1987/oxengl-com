# OxenGL Enterprise Blueprint: Frontend MFA Screens & Backend ABAC Middleware
**Target Role:** Principal Software Architect, Lead Security Engineer, UI/UX Lead
**Objective:** Deploy an enterprise-grade multi-factor authentication (MFA) step-up workflow inside the Next.js frontend, and enforce dynamic, row-level Attribute-Based Access Control (ABAC) data-isolation middleware within the FastAPI backend.

---

## SECTION 1: FASTAPI BACKEND ABAC SECURITY MIDDLEWARE
Role-Based Access Control (RBAC) handles *what actions* a user can perform (e.g., `INVENTORY_ADJUST`), but Attribute-Based Access Control (ABAC) restricts *which specific records* they can manipulate based on user session properties.

### 1. The ABAC Policy Context Model
Create or append the security structures inside `backend/app/security/abac.py`. This framework matches user context attributes directly against resource parameters.

```python
from typing import List, Optional
from pydantic import BaseModel, UUID4
from fastapi import HTTPException, status

class ABACUserContext(BaseModel):
    """User security parameters extracted dynamically from the validated JWT claims."""
    user_id: UUID4
    tenant_id: UUID4
    allowed_company_ids: List[UUID4]
    allowed_warehouse_ids: List[UUID4]
    allowed_fleet_regions: List[str]
    is_super_admin: bool = False

class ResourceAttributes(BaseModel):
    """Structural properties of the target record being accessed or modified."""
    tenant_id: UUID4
    company_id: Optional[UUID4] = None
    warehouse_id: Optional[UUID4] = None
    fleet_region: Optional[str] = None
```

### 2. The Algorithmic ABAC Enforcement Engine
Implement the core decision evaluation logic to systematically isolate data scopes.

```python
class ABACEngine:
    @staticmethod
    def authorize(user: ABACUserContext, resource: ResourceAttributes, action: str) -> bool:
        """Evaluates security properties against data payload models."""
        if user.is_super_admin:
            return True
            
        # 1. Non-negotiable Tenant Isolation
        if user.tenant_id != resource.tenant_id:
            return False
            
        # 2. Multi-Company Access Boundary Control
        if resource.company_id and (resource.company_id not in user.allowed_company_ids):
            return False
            
        # 3. Warehouse-Level Access Block (Inventory & WMS isolation)
        if resource.warehouse_id and (resource.warehouse_id not in user.allowed_warehouse_ids):
            # Restrict WRITE actions aggressively; allow read only if explicitly overridden
            if action in ["WRITE", "CREATE", "DELETE", "ADJUST"]:
                return False
                
        # 4. Fleet & Logistics Regional Isolation Mapping
        if resource.fleet_region and (resource.fleet_region not in user.allowed_fleet_regions):
            return False
            
        return True

def enforce_abac(action: str):
    """FastAPI Dependency factory to intercept requests and evaluate attributes data rules."""
    async def dependency(
        current_user: ABACUserContext = Depends(get_current_user),
        # Assume data repository fetches resource metadata parameters out-of-band via request path ID
        resource_attrs: ResourceAttributes = Depends(fetch_target_resource_attributes)
    ):
        if not ABACEngine.authorize(current_user, resource_attrs, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: You do not possess the required data attributes to view or modify this record."
            )
        return current_user
    return dependency
```

### 3. Apply Enforcement hooks to API Routes
Integrate the dependency directly into sensitive modular routes inside Phase 1:
- `backend/app/api/v1/inventory.py` -> `@router.post("/adjust", dependencies=[Depends(enforce_abac("ADJUST"))])`
- `backend/app/api/v1/finance.py` -> `@router.post("/journals/post", dependencies=[Depends(enforce_abac("WRITE"))])`

---

## SECTION 2: NEXT.JS FRONTEND MFA AUTHENTICATION LIFECYCLE
The UI layer must process a multi-tier login sequence without exposing active routes until verification succeeds.

[ Client Submit credentials to /auth/login ]│▼[ Backend Returns HTTP 200 Payload ]"mfa_required": true, "challenge_token"│▼[ Intercept Route -> Route to /auth/verify-mfa ]│▼[ User submits 6-digit TOTP token ]│▼[ Backend Issues Final Access & Refresh Tokens ]│▼[ Save to Secure Storage -> Route to Dashboard ]
### 1. Intercepting Authentication State Store
Modify your central Redux auth configuration slice state (`frontend/src/features/auth/authSlice.ts`) or state context mapping to parse authentication phases smoothly:

```typescript
interface AuthState {
  user: any | null;
  accessToken: string | null;
  refreshToken: string | null;
  isMfaRequired: boolean;
  challengeToken: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isMfaRequired: false,
  challengeToken: null,
  isLoading: false,
  error: null,
};
```

### 2. Implement the MFA Verification Screen View
Create a secure view component interface inside **`frontend/src/views/MfaVerificationView.tsx`**. This interface renders a clean, keyboard-accessible 6-digit verification layout using TailwindCSS.

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { verifyMfaAction } from '../features/auth/authActions';

export const MfaVerificationView: React.FC = () => {
  const [otp, setOtp] = useState<string[]>(new Array(6).fill(""));
  const inputRefs = useRef<HTMLInputElement[]>([]);
  const dispatch = useDispatch();
  const { challengeToken, error, isLoading } = useSelector((state: any) => state.auth);

  const handleChange = (element: HTMLInputElement, index: number) => {
    if (isNaN(Number(element.value))) return;
    
    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);

    // Auto-focus next field input loop
    if (element.value !== "" && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && otp[index] === "" && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length === 6) {
      dispatch(verifyMfaAction({ code, challengeToken }));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-slate-800 p-8 shadow-2xl border border-slate-700">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-white">Two-Factor Security</h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Open your authenticator app and enter the 6-digit confirmation security code below.
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="flex justify-center gap-2">
            {otp.map((data, index) => (
              <input
                key={index}
                type="text"
                maxLength={1}
                className="h-12 w-12 rounded-lg bg-slate-900 text-center text-xl font-semibold text-white border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                value={data}
                onChange={e => handleChange(e.target, index)}
                onKeyDown={e => handleKeyDown(e, index)}
                ref={el => (inputRefs.current[index] = el!)}
              />
            ))}
          </div>

          {error && <div className="text-sm font-medium text-red-500 text-center">{error}</div>}

          <button
            type="submit"
            disabled={isLoading || otp.join("").length !== 6}
            className="group relative flex w-full justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:bg-slate-700 disabled:text-slate-500"
          >
            {isLoading ? "Verifying Token..." : "Authenticate Session"}
          </button>
        </form>
      </div>
    </div>
  );
};
```

---

## SECTION 3: SYSTEM MIGRATION TESTING REQUIREMENTS
Before checking off this task group, the automated test pipelines (`backend/tests/`) must prove security bounds:
- **Test Case ABAC-01**: A user from `Tenant-01` must be rejected with an immediate `403 Forbidden` error if they try to access data paths in `Tenant-02`.
- **Test Case ABAC-02**: A Warehouse Manager assigned explicitly to `WH-01` must be blocked if they trigger an inventory adjustment request directed at `WH-02`.
- **Test Case MFA-01**: Accessing a protected endpoint using only a `challenge_token` payload without completing the full TOTP verification check must fail with an immediate `401 Unauthorized` signature error.

