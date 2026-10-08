# Phase 6: Secure Tenant Onboarding (Email & SMS Verification)

## Strategic Objective
Refactor the tenant registration pipeline to require Email and SMS OTP verification *before* executing the heavy database onboarding script. This prevents bot registrations, ensures contact data validity for future SaaS billing, and utilizes Redis for high-speed, temporary token storage.

## Architecture & Tooling
*   **Cache Layer:** Redis (already running in container) for OTP TTL (Time-To-Live) management (5 minutes).
*   **Email Provider:** SMTP/SendGrid via `aiosmtplib` or `requests`.
*   **SMS Provider:** Twilio/Vonage REST API.
*   **Flow:** 
    1. User submits basic registration info.
    2. Backend generates a 6-digit OTP, stores in Redis (`otp:email:user@domain.com`), and sends via Email/SMS.
    3. User submits OTP. Backend validates against Redis.
    4. Upon success, backend executes `seed_tenant_default_records` and creates the workspace.

---

## Agent Execution Plan

### Step 1: Create OTP & Notification Services
**Target File:** `backend/app/services/notification_service.py` (Create new)
**Agent Task:** Write a robust asynchronous service to handle OTP generation, Redis caching, and external dispatch.

```python
import random
import json
from datetime import timedelta
from backend.app.core.redis import redis_client # Assuming standard redis client
import httpx
import logging

logger = logging.getLogger(__name__)

class VerificationService:
    OTP_TTL = timedelta(minutes=5)

    @staticmethod
    async def generate_and_store_otp(identifier: str) -> str:
        """Generates a 6-digit OTP and stores it in Redis."""
        otp = f"{random.randint(100000, 999999)}"
        # Store securely with expiration
        await redis_client.setex(f"otp:{identifier}", VerificationService.OTP_TTL, otp)
        return otp

    @staticmethod
    async def verify_otp(identifier: str, provided_otp: str) -> bool:
        """Verifies the OTP and deletes it upon success to prevent replay attacks."""
        key = f"otp:{identifier}"
        stored_otp = await redis_client.get(key)
        
        if stored_otp and stored_otp.decode("utf-8") == provided_otp:
            await redis_client.delete(key)
            return True
        return False

    @staticmethod
    async def dispatch_email_otp(email: str, otp: str, company_name: str):
        """Placeholder for SendGrid/SMTP dispatch."""
        logger.info(f"MOCK EMAIL DISPATCH: Send OTP {otp} to {email} for {company_name}")
        # TODO: Implement actual SMTP/SendGrid HTTP call

    @staticmethod
    async def dispatch_sms_otp(phone: str, otp: str):
        """Placeholder for Twilio/Vonage dispatch."""
        logger.info(f"MOCK SMS DISPATCH: Send OTP {otp} to {phone}")
        # TODO: Implement actual Twilio HTTP call

       from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from backend.app.services.notification_service import VerificationService

router = APIRouter()

class RegisterInitRequest(BaseModel):
    company_name_en: str
    admin_email: str
    domain_slug: str
    phone_number: str = None # Optional for SMS

class RegisterVerifyRequest(BaseModel):
    admin_email: str
    otp_code: str
    # Include all other original registration fields here to execute the final DB write

@router.post("/api/v1/auth/register-init")
async def initiate_tenant_registration(req: RegisterInitRequest, background_tasks: BackgroundTasks):
    """Step 1: Validate slug availability, generate OTP, and send via email/SMS."""
    # TODO: Agent to insert DB check here to ensure domain_slug and admin_email are not taken
    
    otp = await VerificationService.generate_and_store_otp(req.admin_email)
    
    # Dispatch asynchronously so the API responds instantly
    background_tasks.add_task(VerificationService.dispatch_email_otp, req.admin_email, otp, req.company_name_en)
    if req.phone_number:
         background_tasks.add_task(VerificationService.dispatch_sms_otp, req.phone_number, otp)
         
    return {"message": "Verification code dispatched. Expires in 5 minutes."}

@router.post("/api/v1/auth/register-verify")
async def verify_and_provision_tenant(req: RegisterVerifyRequest, db: Session = Depends(get_db)):
    """Step 2: Validate OTP. If valid, provision the database and seed records."""
    is_valid = await VerificationService.verify_otp(req.admin_email, req.otp_code)
    
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
        
    # TODO: Agent to insert the existing DB creation and `seed_tenant_default_records` logic here.
    # Return standard successful login token payload.
    return {"message": "Workspace successfully provisioned and verified."}

    Step 3: Frontend Modal & Integration
Target Files: frontend/src/views/auth/RegisterWorkspace.tsx, frontend/src/api/auth.ts
Agent Task:

Update the RegisterWorkspace component to capture the initial form.

Upon submitting register-init, transition the UI to an OtpVerificationModal.

The modal submits the OTP to register-verify and logs the user in upon a 200 OK response.
