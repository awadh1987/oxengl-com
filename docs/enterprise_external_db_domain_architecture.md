# Enterprise External Database & Custom Domain Architecture Specification

## Overview
This document outlines the architecture for supporting enterprise tenants who wish to host their databases on private external servers, migrate existing local databases to external servers, and automatically provision custom domains with SSL/TLS.

---

## 1. Core Architectural Capabilities (Additive & Optional)
The default local containerized PostgreSQL storage remains untouched as the core baseline. The following three optional pathways are supported:
1. **External Setup at Registration:** Optional toggle during sign-up to point directly to a private external PostgreSQL instance.
2. **Post-Registration Migration:** An administrative tool within the Tenant Control Panel allowing live tenants to migrate their active local database to an external private server.
3. **Custom Domain & Zero-Slug Routing:** Automatic domain matching via `Host` headers with automated SSL certificate provisioning.

---

## 2. Phased Implementation Roadmap

### Phase 1: Dual-Mode Registration, In-App Migration Utility & Dynamic External Database Engine
- **Registration Update:** Add an optional toggle ("Use Private External Database") capturing Host, Port, Database Name, Username, and Password.
- **In-App Migration Utility:** Build a secure background worker triggered from the Tenant Control Panel that dumps local schema/data via TLS/SSL, provisions the target external PostgreSQL instance, and updates the master tenant connection string mapping.
- **Dynamic Connection Pooling:** Refactor `database.py` / session factories to dynamically resolve SQLAlchemy connection strings based on tenant configuration flags at runtime.

### Phase 2: Host-Header Middleware & Zero-Slug Routing
- **Host-Header Interception:** Implement backend and frontend middleware (`App.tsx`) to inspect incoming HTTP `Host` headers.
- **Zero-Slug Resolution:** Automatically map incoming requests from custom domains (e.g., `myon-contract.cloud`) to the corresponding tenant partition, bypassing the central hub login slug requirement.

### Phase 3: Automated SSL/TLS Provisioning Worker
- **ACME / Let's Encrypt Integration:** Build an automated background worker linked to the custom domain verification workflow.
- **Certificate Deployment:** Automatically request, generate, and deploy SSL certificates upon successful CNAME verification (`domains.oxengl.me`) to eliminate browser security warnings.

### Phase 4: Validation & Boundary Testing
- **Integration Testing:** Write robust automated tests verifying data isolation, RLS boundaries, and session persistence across local, registered external, and migrated database tenants.
