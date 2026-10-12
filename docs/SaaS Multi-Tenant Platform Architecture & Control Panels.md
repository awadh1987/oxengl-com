# UI/UX Design Considerations
# Master Platform Control Panel (Super Admin)
# Information Density & Layout: Design for internal operators and DevOps engineers using high-density data tables, fixed side navigation, and persistent system status banners (uptime, error rates, global traffic).

# Visual Hierarchy & Safety: Use high-contrast color palettes (often dark mode by default) with stark visual indicators. Destructive actions—such as tenant deletion or global feature toggles—must require multi-step confirmation modals with explicit type-to-confirm inputs.

# Quick-Switch Globals: Include a global search bar with keyboard shortcuts (e.g., Cmd+K) capable of instantly querying tenants, user IDs, or error logs across the entire SaaS infrastructure.

# Tenant Control Panel (Company Admin)
# Contextual Branding: Allow workspace-level customization where the UI dynamically reflects the tenant's uploaded logo and brand accent colors across the sidebar header and primary buttons.

# Progressive Disclosure: Keep everyday settings clean and accessible, nesting advanced configurations (such as webhooks, API keys, and enterprise SSO setups) under dedicated sub-sections to avoid overwhelming non-technical administrators.

# Role-Based Visibility: Hide administrative options entirely (rather than graying them out) for users whose roles lack permission to manage billing, security, or team invites.

#  Domain & Subdomain Management UI/UX
# Guided Setup Wizards: Break custom domain configuration down into a clear, linear multi-step wizard rather than dumping raw DNS instructions on a single page.

# Live Status Feedback: Implement real-time polling or status badges for DNS propagation and SSL certificate provisioning (e.g., Checking CNAME..., Provisioning SSL..., Active). Provide immediate, user-friendly error messages if records fail validation.

# One-Click Copy Targets: Every DNS record value (e.g., Host, Type, Value) must feature an instant copy-to-clipboard button with visual confirmation checkmarks.

# VS Code AI Agent Prompt
# Copy and paste this prompt directly into your AI coding assistant (such as GitHub Copilot, Cursor, or a VS Code extension) to scaffold your multi-tenant architecture and routing:
# Markdown
# Act as a Principal Full-Stack Architect. I am building a scalable multi-tenant SaaS commercial business platform. I need you to scaffold the core architecture handling master admin control, tenant-scoped control panels, and wildcard subdomain/custom domain routing.
# Please generate clean, modular code and structural blueprints covering the following requirements:

1. **Routing & Tenant Resolution Middleware:**

   - Write a Node.js/Express (or Next.js API/Middleware) function that intercepts incoming requests, extracts the `Host` header, parses subdomains, and queries a Redis cache/database to resolve the `tenant_id`.
   - Handle root domain requests (`app.yourplatform.com`), master admin requests (`admin.yourplatform.com`), and custom domains (`custom-client-domain.com`).

2. **Data Isolation Strategy:**
   - Provide a database schema example (Prisma or PostgreSQL) implementing a multi-tenant pattern with `tenant_id` foreign keys and Row-Level Security (RLS) policies to ensure data isolation.

3. **Control Panel API Stubs:**
   - Create route controllers for the Master Platform (tenant provisioning, global feature flags) and Tenant Control Panel (team member invites, settings update).

4. **Frontend Dynamic Shell:**
   - Provide a React/Next.js layout component that reads the resolved tenant context and dynamically adapts the UI shell (branding colors, tenant logo, navigation items).

Keep the implementation modern, secure, and production-ready.

name: SaaS Multi-Tenant CI/CD Pipeline

on:
  push:
    branches: [ main, production ]
  pull_request:
    branches: [ main, production ]

jobs:
  validate-and-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_DB: oxen_gl_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js Environment
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Setup Python Environment
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Python Test Dependencies
        run: |
          python -m venv .venv
          source .venv/bin/activate
          pip install --upgrade pip pytest requests psycopg2-binary

      - name: Run Database Migrations & RLS Schema Setup
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/oxen_gl_test
        run: |
          psql $DATABASE_URL -f backend/schema_multi_tenant_rls.sql

      - name: Execute SaaS Architecture Test Suite
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/oxen_gl_test
          REDIS_URL: redis://localhost:6379
        run: |
          source .venv/bin/activate
          python3 test_saas_platform_architecture.py

      - name: Run Frontend & Backend TypeScript Build
        run: npm run build

  deploy-production:
    needs: validate-and-test
    if: github.ref == 'refs/heads/production' && github.event_name == 'push'
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and Push Docker Image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}/oxen-gl-saas:latest

      - name: Trigger Zero-Downtime Deployment Hook
        env:
          DEPLOY_WEBHOOK_URL: ${{ secrets.PRODUCTION_DEPLOY_WEBHOOK }}
        run: |
          curl -X POST "$DEPLOY_WEBHOOK_URL" \
            -H "Authorization: Bearer ${{ secrets.DEPLOY_SECRET_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data '{"version": "${{ github.sha }}", "action": "rolling_update"}'
            