"""Unify platform master settings, landing sections CMS, and system broadcasts.

Revision ID: 202610090002
Revises: 202610090001
Create Date: 2026-10-09 20:45:00.000000

"""
from __future__ import annotations

import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

revision: str = '202610090002'
down_revision: Union[str, None] = '202610090001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_LANDING_SECTIONS = [
    {
        "id": "sec-hero",
        "section_key": "hero",
        "locale": "en",
        "title": "Sovereign Multi-Tenant ERP Architecture for the Kingdom of Saudi Arabia",
        "subtitle": "Sub-millisecond query isolation, cryptographic ZATCA Phase 2 compliance, and raw quarry logistics orchestration—engineered on bare-metal PostgreSQL 16 and FastAPI.",
        "content_data": {
            "badge": "v4.8 ENTERPRISE CONTROL PLANE",
            "cta_primary": {"label": "Deploy Workspace", "url": "/register"},
            "cta_secondary": {"label": "Console Sign In", "url": "/tenant/login"},
            "hero_graphic": "/hero-mesh.png",
            "stats": [
                {"label": "Query Latency", "value": "< 1.2ms"},
                {"label": "ZATCA Clearance", "value": "100% Phase 2"},
                {"label": "Fleet Live Tracking", "value": "Real-time GPS"},
                {"label": "Data Isolation", "value": "RLS + Schema"}
            ]
        },
        "sort_order": 1,
        "is_visible": True,
    },
    {
        "id": "sec-features",
        "section_key": "features",
        "locale": "en",
        "title": "Engineered for Heavy Industry & Absolute Data Sovereignty",
        "subtitle": "Purpose-built modules for quarry operations, concrete batching, logistics, and regulatory compliance.",
        "content_data": {
            "items": [
                {
                    "id": "zatca",
                    "title": "ZATCA Phase 2 Cryptographic Clearance",
                    "description": "Automated XML UBL 2.1 generation, ECDSA secp256k1 signing, cryptographic stamps, and direct clearance with ZATCA Fatoora servers.",
                    "icon": "ShieldCheck",
                    "badge": "Regulatory"
                },
                {
                    "id": "logistics",
                    "title": "Quarry & Fleet Radar",
                    "description": "Real-time telemetry, automated weighbridge gross-tare-net calculation, driver dispatching, and geofenced routes.",
                    "icon": "Truck",
                    "badge": "Operations"
                },
                {
                    "id": "finance",
                    "title": "Multi-Tenant General Ledger",
                    "description": "Sub-millisecond double-entry ledger, accounts payable/receivable, real-time balance sheets, and tax audits.",
                    "icon": "Landmark",
                    "badge": "Financials"
                },
                {
                    "id": "customs",
                    "title": "Customs & Port Clearance",
                    "description": "End-to-end manifest tracking, customs duty escrow, port authority integration, and container manifests.",
                    "icon": "Ship",
                    "badge": "Trade"
                },
                {
                    "id": "hr",
                    "title": "HRMS & GOSI / WPS Payroll",
                    "description": "Saudi Labor Law compliance, automated Muqeem/Qiwa tracking, WPS bank file generation, and employee self-service.",
                    "icon": "Users",
                    "badge": "Workforce"
                },
                {
                    "id": "ai",
                    "title": "Autonomous AI Financial Auditor",
                    "description": "Continuous ledger reconciliation, anomaly detection, predictive cashflow forecasting, and automated voucher audit.",
                    "icon": "Sparkles",
                    "badge": "Intelligence"
                }
            ]
        },
        "sort_order": 2,
        "is_visible": True,
    },
    {
        "id": "sec-metrics",
        "section_key": "metrics",
        "locale": "en",
        "title": "Industrial Proven Reliability",
        "subtitle": "Handling mission-critical heavy industry workloads across Saudi Arabia.",
        "content_data": {
            "metrics": [
                {"label": "Transactions Processed", "value": "12.4M+", "change": "+28% MoM"},
                {"label": "Fleet Kilometers Monitored", "value": "8.2M km", "change": "99.98% uptime"},
                {"label": "Invoices Cleared", "value": "100%", "change": "ZATCA Phase 2"},
                {"label": "System Availability", "value": "99.99%", "change": "Zero-downtime"}
            ]
        },
        "sort_order": 3,
        "is_visible": True,
    },
    {
        "id": "sec-pricing",
        "section_key": "pricing_matrix",
        "locale": "en",
        "title": "Predictable Enterprise Subscriptions",
        "subtitle": "Transparent pricing with dedicated instances, sovereign hosting, and unlimited scalability.",
        "content_data": {
            "tiers": [
                {
                    "id": "starter",
                    "name": "Starter Industrial",
                    "tagline": "For independent quarries & logistics contractors",
                    "price_monthly": "SAR 2,499",
                    "price_annual": "SAR 24,990",
                    "badge": "Essential",
                    "features": [
                        "Up to 10 Fleet Vehicles & Weighbridge Units",
                        "ZATCA Phase 2 Invoicing & Reporting",
                        "Standard Chart of Accounts & Financial Vouchers",
                        "Multi-User RBAC (Up to 15 Seats)",
                        "Standard SLA & Email Support"
                    ],
                    "cta": {"label": "Deploy Workspace", "url": "/register?plan=starter"}
                },
                {
                    "id": "enterprise",
                    "name": "Enterprise Corporate",
                    "tagline": "For multi-branch quarry & contracting conglomerates",
                    "price_monthly": "SAR 6,999",
                    "price_annual": "SAR 69,990",
                    "badge": "Most Popular",
                    "highlighted": True,
                    "features": [
                        "Unlimited Fleet Vehicles & Weighbridge Stations",
                        "Direct ZATCA Clearance & Real-Time E-Invoicing",
                        "Advanced HRMS, WPS Payroll & GOSI Compliance",
                        "AI Financial Auditor & Anomaly Detection",
                        "Custom Domain & Dynamic White-Label Branding",
                        "Dedicated Account Manager & 99.95% SLA"
                    ],
                    "cta": {"label": "Start Enterprise Pilot", "url": "/register?plan=enterprise"}
                },
                {
                    "id": "sovereign",
                    "name": "Sovereign Dedicated",
                    "tagline": "On-premise or sovereign private cloud deployment",
                    "price_monthly": "Custom Quote",
                    "price_annual": "Contact Sales",
                    "badge": "Sovereign",
                    "features": [
                        "Isolated PostgreSQL Database Cluster in KSA",
                        "Custom ERP Core Module Extensions & APIs",
                        "Air-Gapped & Bare-Metal Hardware Deployment Option",
                        "Continuous Security Audit & Penetration Testing",
                        "24/7 Dedicated NOC Support with 15-minute SLA"
                    ],
                    "cta": {"label": "Contact Executive Sales", "url": "mailto:sales@oxengl.me"}
                }
            ]
        },
        "sort_order": 4,
        "is_visible": True,
    },
    {
        "id": "sec-testimonials",
        "section_key": "testimonials",
        "locale": "en",
        "title": "Trusted by Leaders in Heavy Industry",
        "subtitle": "What operators and CFOs say about OxenGL.",
        "content_data": {
            "items": [
                {
                    "quote": "OxenGL completely eliminated weighbridge discrepancies and brought our ZATCA Phase 2 compliance to 100% automation.",
                    "author": "Tariq Al-Harbi",
                    "role": "VP of Operations, Riyadh Aggregates Co."
                },
                {
                    "quote": "The ledger performance is extraordinary. Closing our monthly books takes minutes instead of weeks.",
                    "author": "Mona Al-Ghamdi",
                    "role": "Chief Financial Officer, Red Sea Quarrying Group"
                }
            ]
        },
        "sort_order": 5,
        "is_visible": True,
    },
    {
        "id": "sec-faq",
        "section_key": "faq",
        "locale": "en",
        "title": "Frequently Asked Questions",
        "subtitle": "Everything you need to know about OxenGL ERP and deployment.",
        "content_data": {
            "items": [
                {
                    "question": "Is OxenGL fully compliant with ZATCA Phase 2?",
                    "answer": "Yes. OxenGL generates standard UBL 2.1 XML invoices with cryptographic signatures (ECDSA secp256k1), cryptographic stamps, and communicates directly with ZATCA clearance endpoints."
                },
                {
                    "question": "Where is customer data hosted?",
                    "answer": "All tenant data is strictly hosted within the Kingdom of Saudi Arabia in compliance with National Data Management Authority (NDMA) regulations."
                },
                {
                    "question": "Can we use our own custom domain and branding?",
                    "answer": "Yes. Enterprise tenants can bind custom domains with automatic SSL provisioning and full white-label logos, colors, and email templates."
                },
                {
                    "question": "How does multi-tenant isolation work?",
                    "answer": "OxenGL utilizes PostgreSQL Row-Level Security (RLS) combined with schema/tenant isolation to guarantee zero data leakage between organizations."
                }
            ]
        },
        "sort_order": 6,
        "is_visible": True,
    },
    {
        "id": "sec-footer",
        "section_key": "footer",
        "locale": "en",
        "title": "OxenGL",
        "subtitle": "Sovereign Saudi-first Enterprise Resource Planning platform.",
        "content_data": {
            "copyright": "© 2026 OxenGL Enterprise. All rights reserved. Sovereign infrastructure in KSA.",
            "contact_email": "ops@oxengl.me",
            "contact_phone": "+966 11 000 0000",
            "contact_address": "Riyadh, Saudi Arabia",
            "links": [
                {"label": "Platform Console", "url": "/tenant/login"},
                {"label": "Register Workspace", "url": "/register"},
                {"label": "Security & Compliance", "url": "/compliance"},
                {"label": "Terms of Service", "url": "/terms"},
                {"label": "Privacy Policy", "url": "/privacy"}
            ]
        },
        "sort_order": 7,
        "is_visible": True,
    }
]


def upgrade() -> None:
    # 1. Create platform_master_settings
    op.execute("""
        CREATE TABLE IF NOT EXISTS platform_master_settings (
            id VARCHAR(36) PRIMARY KEY,
            platform_name VARCHAR(128) NOT NULL DEFAULT 'OxenGL',
            platform_tagline VARCHAR(255) NULL,
            logo_light_url VARCHAR(512) NULL,
            logo_dark_url VARCHAR(512) NULL,
            favicon_url VARCHAR(512) NULL,
            primary_color VARCHAR(32) NOT NULL DEFAULT '#f97316',
            secondary_color VARCHAR(32) NOT NULL DEFAULT '#0f172a',
            support_email VARCHAR(255) NULL,
            legal_terms_url VARCHAR(512) NULL,
            privacy_policy_url VARCHAR(512) NULL,
            custom_css TEXT NULL,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_by VARCHAR(36) NULL
        );
    """)

    # 2. Create platform_landing_sections
    op.execute("""
        CREATE TABLE IF NOT EXISTS platform_landing_sections (
            id VARCHAR(36) PRIMARY KEY,
            section_key VARCHAR(64) UNIQUE NOT NULL,
            locale VARCHAR(10) NOT NULL DEFAULT 'en',
            title VARCHAR(255) NULL,
            subtitle TEXT NULL,
            content_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            sort_order INT NOT NULL DEFAULT 0,
            is_visible BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_platform_landing_sections_key ON platform_landing_sections(section_key);
        CREATE INDEX IF NOT EXISTS ix_platform_landing_sections_order ON platform_landing_sections(sort_order);
    """)

    # 3. Create system_broadcasts
    op.execute("""
        CREATE TABLE IF NOT EXISTS system_broadcasts (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            severity VARCHAR(32) NOT NULL DEFAULT 'info',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP WITH TIME ZONE NULL,
            is_dismissible BOOLEAN NOT NULL DEFAULT TRUE,
            target_scope VARCHAR(64) NOT NULL DEFAULT 'all',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(36) NULL
        );
        CREATE INDEX IF NOT EXISTS ix_system_broadcasts_active ON system_broadcasts(is_active, starts_at, expires_at);
    """)

    # 4. Migrate existing configuration values from legacy records into platform_master_settings
    bind = op.get_bind()

    # Seed or upsert platform_master_settings
    default_meta = json.dumps({
        "company_name_ar": "منظومة أوكسن السحابية",
        "company_name_en": "OxenGL Enterprise Cloud",
        "support_phone": "+966 50 123 4567",
        "contact_address": "Riyadh, Saudi Arabia"
    })
    bind.execute(text("""
        INSERT INTO platform_master_settings (
            id, platform_name, platform_tagline, logo_light_url, logo_dark_url,
            favicon_url, primary_color, secondary_color, support_email, metadata
        ) VALUES (
            'default', 'OxenGL Enterprise',
            'Sovereign Saudi-first Enterprise Resource Planning platform. Engineering high-density quarry, heavy contracting, and multi-tenant financial infrastructure.',
            '/oxengl-wordmark.svg', '/oxengl-wordmark.svg', '/favicon.ico',
            '#f97316', '#0f172a', 'contact@oxengl.me', CAST(:meta AS jsonb)
        ) ON CONFLICT (id) DO NOTHING;
    """), {"meta": default_meta})

    # Try copying values from site_settings if available
    bind.execute(text("""
        DO $$
        DECLARE
            v_name TEXT;
            v_tagline TEXT;
            v_logo TEXT;
            v_email TEXT;
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'site_settings') THEN
                SELECT value INTO v_name FROM site_settings WHERE key = 'site_name';
                SELECT value INTO v_tagline FROM site_settings WHERE key = 'site_tagline';
                SELECT value INTO v_logo FROM site_settings WHERE key = 'site_logo';
                SELECT value INTO v_email FROM site_settings WHERE key = 'contact_email';

                UPDATE platform_master_settings
                SET
                    platform_name = COALESCE(v_name, platform_name),
                    platform_tagline = COALESCE(v_tagline, platform_tagline),
                    logo_light_url = COALESCE(v_logo, logo_light_url),
                    logo_dark_url = COALESCE(v_logo, logo_dark_url),
                    support_email = COALESCE(v_email, support_email),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 'default';
            END IF;
        END $$;
    """))

    # 5. Seed default landing sections
    for sec in DEFAULT_LANDING_SECTIONS:
        bind.execute(text("""
            INSERT INTO platform_landing_sections (
                id, section_key, locale, title, subtitle, content_data, sort_order, is_visible
            ) VALUES (
                :id, :section_key, :locale, :title, :subtitle, CAST(:content_data AS jsonb), :sort_order, :is_visible
            ) ON CONFLICT (section_key) DO UPDATE SET
                title = EXCLUDED.title,
                subtitle = EXCLUDED.subtitle,
                content_data = EXCLUDED.content_data,
                sort_order = EXCLUDED.sort_order,
                is_visible = EXCLUDED.is_visible,
                updated_at = CURRENT_TIMESTAMP;
        """), {
            "id": sec["id"],
            "section_key": sec["section_key"],
            "locale": sec["locale"],
            "title": sec["title"],
            "subtitle": sec["subtitle"],
            "content_data": json.dumps(sec["content_data"]),
            "sort_order": sec["sort_order"],
            "is_visible": sec["is_visible"],
        })

    # 6. Seed initial system broadcast
    bind.execute(text("""
        INSERT INTO system_broadcasts (
            id, title, message, severity, is_active, starts_at, is_dismissible, target_scope
        ) VALUES (
            'broadcast-welcome',
            'OxenGL Sovereign Platform 4.8 Active',
            'All core infrastructure engines (PostgreSQL 16, ZATCA Phase 2, Heavy Logistics, and General Ledger) are running at nominal latency.',
            'info',
            TRUE,
            CURRENT_TIMESTAMP,
            TRUE,
            'all'
        ) ON CONFLICT (id) DO NOTHING;
    """))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS system_broadcasts CASCADE;")
    op.execute("DROP TABLE IF EXISTS platform_landing_sections CASCADE;")
    op.execute("DROP TABLE IF EXISTS platform_master_settings CASCADE;")
