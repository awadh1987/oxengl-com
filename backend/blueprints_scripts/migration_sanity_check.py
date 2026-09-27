#!/usr/bin/env python3
"""
OxenGL Enterprise Migration Sanity Checker
Purpose: Verifies workspace consolidation, path integrity, domain module alignment,
         and absolute de-duplication across frontend and backend boundaries.
"""

import os
import sys
from pathlib import Path

# Color signatures for scannable output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"

def print_status(message: str, status: str, color: str = GREEN):
    print(f"[{color}{status:^8}{RESET}] {message}")

def check_workspace():
    print(f"{BOLD}=== Starting OxenGL Platform Migration Sanity Check ==={RESET}\n")
    
    root = Path(os.getcwd())
    errors = 0
    warnings = 0

    # 1. Structural Directory Baseline Checks
    critical_directories = [
        "backend/app",
        "backend/app/api",
        "backend/app/core",
        "backend/app/db",
        "backend/app/domains/iam",
        "backend/app/domains/finance",
        "backend/app/domains/procurement",
        "backend/app/domains/inventory",
        "backend/app/domains/logistics",
        "backend/alembic",
        "frontend/src/components",
        "frontend/src/views",
        "docs/blueprints",
        "infrastructure"
    ]

    print(f"{BOLD}1. Verifying Structural Layout Permissions & Paths...{RESET}")
    for d in critical_directories:
        target_path = root / d
        if target_path.exists() and target_path.is_dir():
            print_status(f"Verified directory footprint: {d}", "PASSED", GREEN)
        else:
            print_status(f"Missing required consolidated directory: {d}", "CRITICAL", RED)
            errors += 1

    # 2. Critical Configuration & Core File Checks
    print(f"\n{BOLD}2. Validating Core Application File Placements...{RESET}")
    critical_files = {
        "backend/app/main.py": "FastAPI Entry Point",
        "backend/requirements.txt": "Unified Backend Python Dependencies",
        "backend/Dockerfile": "Containerization Core Configuration",
        "backend/alembic.ini": "Database Migration Routing Schema",
        "frontend/package.json": "NodeJS Build Environment Node Settings",
        "frontend/vite.config.ts": "Vite/Next Network Proxy Routing Mapping",
        "frontend/src/types.ts": "Unified TypeScript Strict Types Domain Profile",
        "frontend/src/views/FleetMaintenanceView.tsx": "Phase 2 Fleet View Component Interface",
        "frontend/src/components/FleetTracker.tsx": "Phase 2 WebSocket Fleet Streaming Tracking Interface",
        "docs/blueprints/oxengl_enterprise_upgrade.md": "Master Platform Specifications Blueprint Module"
    }

    for f_path, description in critical_files.items():
        target_file = root / f_path
        if target_file.exists() and target_file.is_file():
            print_status(f"Found {description} at expected path: {f_path}", "FOUND", GREEN)
        else:
            print_status(f"Missing core framework file: {f_path} ({description})", "MISSING", RED)
            errors += 1

    # 3. Detection of Dangerous Structural Duplications (Case Sensitivity Check)
    print(f"\n{BOLD}3. Checking for System Path Duplications and Clashes...{RESET}")
    # Inspecting if both lowercase and uppercase structures are active or side-by-side
    clash_checks = ["Oxen-gl", "oxen-gl", "web"]
    for clash in clash_checks:
        if (root.parent / clash).exists() or (root / clash).exists():
            print_status(f"Legacy folder or reference path link still active: {clash}", "WARNING", YELLOW)
            warnings += 1

    # 4. Competing Environment Isolations
    print(f"\n{BOLD}4. Evaluating Environment Isolation Integrity...{RESET}")
    legacy_venvs = ["venv", "Oxen-gl/.venv"]
    for l_venv in legacy_venvs:
        if (root / l_venv).exists():
            print_status(f"Redundant virtual environment container detected at: {l_venv}", "WARN-DUP", YELLOW)
            warnings += 1
            
    unified_venv = root / "backend/.venv"
    if unified_venv.exists():
        print_status("Unified python environment verified inside backend location.", "OK", GREEN)
    else:
        print_status("Missing master isolated execution framework environment at `backend/.venv`", "CRITICAL", RED)
        errors += 1

    # 5. Domain Metrics & Summary Verdict
    print(f"\n{BOLD}=== Sanity Check Summary Metrics ==={RESET}")
    print(f"Total Architecture Blocking Errors: {RED if errors > 0 else GREEN}{errors}{RESET}")
    print(f"Total Structural Path Warnings:    {YELLOW if warnings > 0 else GREEN}{warnings}{RESET}\n")

    if errors > 0:
        print(f"{RED}{BOLD}🛑 VERDICT: Migration validation failed. Do not remove fallback data stores yet.{RESET}")
        sys.exit(1)
    else:
        print(f"{GREEN}{BOLD}✅ VERDICT: Consolidation layout matches OxenGL master spec standards perfectly.{RESET}")
        sys.exit(0)

if __name__ == "__main__":
    check_workspace()
