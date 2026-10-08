Phase 4 is fully approved. The operational workflows, RBAC, and ZATCA compliance engine are working perfectly. 

You are now authorized to execute **Phase 5: Advanced Product Expansion**. Our goal is to scale the platform by finalizing the mobile fleet operations, SaaS billing, and advanced analytics.

Please execute the following in small, reviewable commits:

## 1. SaaS Subscription & Billing (Control Plane)
* Implement a Subscription Management UI in the Master Control Plane for SuperAdmins to manage tenant plans (e.g., Starter, Standard, Enterprise).
* Enforce tenant usage limits (e.g., max users, max storage) based on their active subscription tier.
* Implement a billing dashboard for Tenant Admins to view their current plan and historical SaaS invoices.

## 2. Mobile Fleet Operations (Tenant Plane)
* Finalize the API endpoints required for the Driver Mobile App (e.g., `GET /api/mobile/trips`, `POST /api/mobile/delivery-proof`).
* Ensure offline-sync capabilities are robust, utilizing UUIDv4 deduplication for inspection logs and weighments uploaded from the field.
* Implement GPS coordinate capture and routing status updates within the Trip lifecycle.

## 3. Maintenance & Fuel Management
* Create backend models and frontend UI screens for Vehicle Maintenance tracking (routine service, repair logs, cost tracking).
* Create a Fuel Log module to track consumption metrics against specific trips and vehicles.

## 4. Analytics & Dashboards
* Upgrade the Tenant Dashboard with real-time analytics: Revenue, Outstanding Receivables, Active Trips, and Fleet Utilization.
* Ensure all analytical queries utilize proper indexing and tenant-filtering to maintain performance at scale.

Report back with a summary of the new modules, API additions, and the results of the mobile API verification tests.
