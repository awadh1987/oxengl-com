# OxenGL HR System Upgrade Blueprint

This document outlines the required data architecture and UI expansion to upgrade the OxenGL HR Registration module to an enterprise-grade, KSA-compliant (MHRSD, GOSI, WPS) system.

## 1. Standardized Job Titles Directory
Update the "Job Role" selection to utilize this tiered organizational structure mapped to Qiwa/Muqeem standards.

### Executive & C-Suite
* Chief Executive Officer (CEO)
* Chief Operating Officer (COO)
* Chief Financial Officer (CFO)
* Chief Technology Officer (CTO)
* General Manager

### Management & Supervisory
* Operations Manager
* Finance Manager
* HR & Admin Manager
* Fleet & Logistics Manager
* Procurement Manager
* Warehouse Supervisor
* Dispatch Supervisor

### Professional & Administrative
* Senior Financial Accountant
* Logistics Operations Specialist
* HR Generalist / Government Relations Officer (Mandoob)
* Procurement Officer
* IT Support Specialist
* Administrative Assistant
* Data Entry Clerk

### Operational & Field
* Fleet Dispatcher
* Heavy Vehicle Driver
* Light Vehicle Driver
* Warehouse Operator
* Forklift Operator
* Maintenance Technician / Mechanic

### Facility & Support
* Security Guard
* Office Boy / Tea Boy
* Cleaner / Janitor

---

## 2. Multi-Tab HR Registration Form Architecture
Refactor the current single-view modal into a multi-tab or stepper-based form to handle the expanded data requirements without cluttering the UI.

### Tab A: Personal & Demographic
* Full Name (Arabic) [Mandatory]
* Full Name (English)
* Date of Birth
* Gender (Male/Female)
* Nationality (Dropdown)
* Marital Status (Single/Married)
* Blood Type
* Personal Mobile
* Emergency Contact Name & Number
* Personal Email

### Tab B: Regulatory & Identity
* ID Type (Saudi National ID / Iqama / GCC ID / Border Number)
* ID / Iqama Number [10-digit validation]
* ID / Iqama Expiry Date (Hijri)
* ID / Iqama Expiry Date (Gregorian)
* Passport Number & Expiry Date
* Profession on Iqama
* Sponsorship Status

### Tab C: Employment & Contract
* Employee ID (Auto/Custom)
* Department
* Job Title (Internal Role - linked to directory)
* Direct Manager / Supervisor
* Hire / Joining Date
* Contract Type (Fixed Term / Indefinite / Part-time / Freelance)
* Contract Duration (12/24 months)
* Probation Period (Standard 90 days)

### Tab D: Payroll & Allowances (WPS Compliant)
* IBAN Number [Starts with SA, 24 chars]
* Bank Name & Bank Code
* Base Salary (SAR)
* Housing Allowance
* Transportation Allowance
* Operational Telecom Allowance
* Food / Other Allowances
* Total Target Salary [Auto-calculated]
* Overtime Eligibility (Yes/No)
* Standard Working Hours
* GOSI Registration Number

### Tab E: Qualifications & Documents
* Highest Education Level
* Field of Study / Major
* Certifications
* Driver's License Type (Private/Public/Heavy)
* Driver's License Expiry Date
* Document Uploads (Drag & Drop zone):
  * National ID / Iqama Copy
  * Passport Copy
  * Signed Employment Contract
  * Education Certificates
  * Driver's License Copy
  * Medical Insurance Card
  