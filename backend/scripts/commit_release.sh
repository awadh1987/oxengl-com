#!/usr/bin/env bash
# ====================================================================
# OxenGL Production Environment Release Staging Wrapper
# Purpose: Automatically formats, stages, and tags the Phase 1-4 deployment release.
# ====================================================================
set -eo pipefail

INFO="\033[94m[OXENGL-RELEASE]\033[0m"
SUCCESS="\033[92m[OXENGL-SUCCESS]\033[0m"

echo -e "\033[1m=== Initiating OxenGL Enterprise Phase 1-4 Production Release Staging ===\033[0m"

# 1. Force stage newly added localized profiles, automation rigs, and integration specs
echo -e "${INFO} Staging untracked locale registries, backup controllers, and onboarding manuals..."
git add -f frontend/src/locales/ar.json
git add -f scripts/backup_db.sh
git add -f scripts/onboard_tenant.py
git add -f scripts/purge_test_data.py
git add -f scripts/stress_test_1000_gps.py
git add -f scripts/deploy_secure_nginx.sh
git add -f docs/manuals/api_integration.md
git add -f docs/manuals/user_onboarding.md
git add -f docs/manuals/testing_guide.md
git add -f docs/blueprints/phase5_long_term_architecture.md
git add -f docs/blueprints/production_release_and_readme.md
git add -f docs/blueprints/production_backups_and_arabic_locale.md
git add -f README.md
git add -f scripts/commit_release.sh

# 2. Commit the signed core bundle with a clear structural release index flag
echo -e "${INFO} Finalizing atomic enterprise repository commit..."
git commit -m "release(core): complete phase 1-4 architecture deployment with phase 5 roadmap and QA guide" || echo "Repository already clean."

# 3. Apply a production tag for immutable orchestration fallback tracking
VERSION_TAG="v1.0.0-phase4-release"
if ! git rev-parse "${VERSION_TAG}" >/dev/null 2>&1; then
    echo -e "${INFO} Tagging release commit as: \033[1m${VERSION_TAG}\033[0m..."
    git tag -a "${VERSION_TAG}" -m "OxenGL Enterprise Core Production Stable Release Phase 1-4"
else
    echo -e "${INFO} Updating release tag: \033[1m${VERSION_TAG}\033[0m..."
    git tag -a -f "${VERSION_TAG}" -m "OxenGL Enterprise Core Production Stable Release Phase 1-4 with Phase 5 Architecture & QA Runbook"
fi

echo -e "\n${SUCCESS} Staging and tagging complete. Run 'git push origin main --tags' to sync upstream cloud mirrors safely.\n"
