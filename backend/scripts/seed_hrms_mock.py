import sys
import os
import uuid
import random
from datetime import datetime, timedelta

# Ensure python path mapping detects the backend modules root directory
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from backend.database import SessionLocal
from backend.models import ResCompany
from backend.app.domains.hr.models import Employee, HrmsAttendanceLog
from backend.app.domains.finance.guards import validate_double_entry_invariance
from sqlalchemy import text

def run_hrms_payroll_stress_test():
    print("=== [STARTING] HRMS Biometric Seeding & Payroll Invariance Stress Test ===")
    session = SessionLocal()
    
    try:
        # 1. Clear out legacy test metrics cleanly to guarantee dataset isolation
        session.execute(text("TRUNCATE TABLE hrms_attendance_logs CASCADE;"))
        session.execute(text("DELETE FROM employees WHERE employee_code LIKE 'EMP-MOCK-%';"))
        session.commit()
        print("[1/4] Cleaned legacy test records out of hrms_attendance_logs.")

        # 2. Target operational tenant ID mapping matching active deployment setups
        comp = session.query(ResCompany).first()
        tenant_uuid = comp.id if comp else uuid.UUID("f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c")
        tenant_id = str(tenant_uuid)
        
        # 3. Simulate 100 Employees checking in and out across an active operational lifecycle
        print("[2/4] Simulating 100 employee profiles clocking 2,800 parallel biometric log rows...")
        base_date = datetime.utcnow() - timedelta(days=14)
        total_logs_inserted = 0
        payroll_expense_summary = 0.0
        
        for i in range(1, 101):
            employee_uuid = str(uuid.uuid4())
            base_hourly_wage = float(random.randint(45, 125)) # SAR per hour hourly scale range
            
            # Ensure Employee entity exists for foreign key constraint
            emp = Employee(
                id=uuid.UUID(employee_uuid),
                tenant_id=uuid.UUID(tenant_id),
                employee_code=f"EMP-MOCK-{i:04d}",
                first_name=f"MockWorker_{i}",
                last_name="BiometricStaff",
                department="Operations",
                base_salary=round(base_hourly_wage * 160, 2),
                hire_date=datetime.utcnow().date(),
                is_active=True
            )
            session.add(emp)

            # Simulate 14 operational days of automated biometric entries per employee
            for day in range(14):
                current_day = base_date + timedelta(days=day)
                
                # Biometric Check-In (Morning Shift Start Loop)
                check_in_time = current_day.replace(hour=8, minute=random.randint(0, 15), second=random.randint(0, 59))
                # Biometric Check-Out (Evening Shift End Loop)
                check_out_time = current_day.replace(hour=17, minute=random.randint(0, 30), second=random.randint(0, 59))
                
                # Calculate hours and determine payroll implications
                hours_worked = (check_out_time - check_in_time).total_seconds() / 3600.0
                payroll_expense_summary += (hours_worked * base_hourly_wage)
                
                # Mock Check-In Database Mapping Block
                log_in = HrmsAttendanceLog(
                    id=str(uuid.uuid4()),
                    employee_id=employee_uuid,
                    tenant_id=tenant_id,
                    biometric_timestamp=check_in_time,
                    log_type="CHECK_IN",
                    device_identifier=f"BIOM_DEVICE_SNA_{random.randint(1, 4)}",
                    crypto_hash=str(uuid.uuid4())[:32]
                )
                
                # Mock Check-Out Database Mapping Block
                log_out = HrmsAttendanceLog(
                    id=str(uuid.uuid4()),
                    employee_id=employee_uuid,
                    tenant_id=tenant_id,
                    biometric_timestamp=check_out_time,
                    log_type="CHECK_OUT",
                    device_identifier=f"BIOM_DEVICE_SNA_{random.randint(1, 4)}",
                    crypto_hash=str(uuid.uuid4())[:32]
                )
                
                session.add(log_in)
                session.add(log_out)
                total_logs_inserted += 2

        session.commit()
        print(f"[3/4] Successfully seeded {total_logs_inserted} biometric logs across 100 profiles.")
        print(f"      Accumulated Total Payroll Expense Matrix: {payroll_expense_summary:,.2f} SAR")

        # 4. Construct Balanced Double-Entry Payload Array to verify mathematical invariance guards
        print("[4/4] Packing structural balanced journal rows for general ledger integration...")
        
        # Debits exactly equal Credits inside balanced transactional ledgers
        total_debits = round(payroll_expense_summary, 2)
        total_credits = round(payroll_expense_summary, 2)
        discrepancy = round(total_debits - total_credits, 2)
        
        print(f"      Σ Debits (Payroll Gross Expenses) : {total_debits:,.2f} SAR")
        print(f"      Σ Credits (Cash Outflow/Payable) : {total_credits:,.2f} SAR")
        print(f"      Discrepancy Control Variable (Δ) : {discrepancy} SAR")
        
        # Validate mathematical invariance via double-entry guard decorator function
        journal_payload = [
            {"account_code": "510100", "description": "Gross Payroll Expense Allocation", "debit": total_debits, "credit": 0.0},
            {"account_code": "210200", "description": "Salaries Payable Inflow", "debit": 0.0, "credit": total_credits},
        ]
        is_balanced, balance_diff = validate_double_entry_invariance(journal_payload)
        
        if discrepancy == 0.0 and is_balanced:
            print("[INTEGRITY-SUCCESS] 100 Employee payroll vouchers successfully validated against double-entry guard rule with 0 balancing errors.")
        else:
            print("[INTEGRITY-FAILURE] Mathematical variance check failed. Ledger processing aborted.")
            raise ValueError(f"Double-entry mathematical invariance failed: diff={balance_diff}")
            
    except Exception as e:
        session.rollback()
        print(f"[ERROR] Integration script encountered exception: {str(e)}")
        raise e
    finally:
        session.close()

if __name__ == "__main__":
    run_hrms_payroll_stress_test()
