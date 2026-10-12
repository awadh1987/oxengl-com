import React, { useState } from 'react';

type ModuleKey = 'gl' | 'weighbridge' | 'hrms' | 'tenancy';

interface ModuleData {
  title: string;
  desc: string;
  uiContent: React.ReactNode;
  filename: string;
  codeSnippet: string;
}

export const WorkflowMatrix: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ModuleKey>('gl');

  const modules: Record<ModuleKey, ModuleData> = {
    gl: {
      title: '5-Level Hierarchical Chart of Accounts & Immutable Audit Logs',
      desc: 'Engineered for strict GAAP, IFRS, and Saudi SOCPA standards with automatic debit/credit balancing, foreign exchange revaluation, and cryptographic tamper detection.',
      uiContent: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span className="font-mono text-cyan" style={{ fontSize: '13px' }}>110101 - Alinma Corporate Treasury</span>
            <span className="font-mono text-emerald" style={{ fontWeight: 'bold' }}>SAR 14,290,450.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span className="font-mono text-cyan" style={{ fontSize: '13px' }}>120101 - Accounts Receivable Trade</span>
            <span className="font-mono text-emerald" style={{ fontWeight: 'bold' }}>SAR 8,940,210.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span className="font-mono text-cyan" style={{ fontSize: '13px' }}>410101 - Quarry Aggregate Sales</span>
            <span className="font-mono text-orange" style={{ fontWeight: 'bold' }}>SAR 32,840,110.00</span>
          </div>
        </div>
      ),
      filename: 'backend/app/domains/accounting/routers/gl_vouchers.py',
      codeSnippet: `@router.post("/api/v1/accounting/vouchers", response_model=VoucherOut)
async def create_balanced_gl_voucher(
    payload: VoucherCreateSchema,
    db: Session = Depends(get_tenant_db)
):
    # Enforce debit/credit balance
    total_debit = sum(l.debit for l in payload.lines)
    total_credit = sum(l.credit for l in payload.lines)
    if total_debit != total_credit:
        raise HTTPException(status_code=400, detail="Voucher lines are unbalanced")
    
    # Generate ZATCA Phase 2 cryptographic SHA-256 digest
    digest = hashlib.sha256(payload.model_dump_json().encode()).hexdigest()
    return await commit_immutable_voucher(db, payload, digest)`,
    },
    weighbridge: {
      title: 'Dual-Scale Real-Time Quarry & Weighbridge Dispatching',
      desc: 'Seamless scale telemetry integration with automated Gross-Tare-Net reconciliation, multi-truck queueing, and instantaneous customs-compliant waybills.',
      uiContent: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span className="font-mono text-orange" style={{ fontSize: '13px' }}>SCALE-01 [ENTRY]: 4120-JBD</span>
            <span className="font-mono text-cyan" style={{ fontWeight: 'bold' }}>GROSS: 42.45 T</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span className="font-mono text-orange" style={{ fontSize: '13px' }}>SCALE-02 [EXIT]: 8910-KSA</span>
            <span className="font-mono text-emerald" style={{ fontWeight: 'bold' }}>NET: 24.30 T [CLEARED]</span>
          </div>
        </div>
      ),
      filename: 'backend/app/domains/logistics/routers/weighbridge.py',
      codeSnippet: `@router.post("/api/v1/weighbridge/tickets")
async def ingest_scale_ticket(
    payload: ScaleTicketPayload,
    db: Session = Depends(get_tenant_db)
):
    net_weight = payload.gross_weight - payload.tare_weight
    ticket = WeighbridgeTicket(
        ticket_no=payload.ticket_no,
        truck_plate=payload.truck_plate,
        gross_weight=payload.gross_weight,
        tare_weight=payload.tare_weight,
        net_weight=net_weight
    )
    db.add(ticket)
    db.commit()
    return {"status": "DISPATCHED", "net_tons": net_weight}`,
    },
    hrms: {
      title: 'Automated GOSI, WPS Payroll, & Saudi Labor Law Compliance',
      desc: 'Native integration with Mol.gov.sa Wage Protection System (WPS), automated end-of-service benefits calculation, and real-time Iqama expiry tracking.',
      uiContent: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '13px' }}>WPS Payroll SIF File Generation</span>
            <span className="font-mono text-emerald" style={{ fontWeight: 'bold' }}>100% COMPLIANT</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '13px' }}>GOSI Social Insurance Settlement</span>
            <span className="font-mono text-cyan" style={{ fontWeight: 'bold' }}>AUTO-CALCULATED</span>
          </div>
        </div>
      ),
      filename: 'backend/app/domains/hrms/routers/payroll.py',
      codeSnippet: `@router.post("/api/v1/hrms/payroll/wps-export")
def generate_saudi_wps_sif_file(
    month: int,
    year: int,
    db: Session = Depends(get_tenant_db)
):
    payroll_batch = db.query(PayrollRun).filter_by(month=month, year=year).one()
    sif_payload = build_mol_sif_format(payroll_batch)
    return Response(
        content=sif_payload,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=WPS_{year}_{month}.txt"}
    )`,
    },
    tenancy: {
      title: 'Two-Tier Multi-Tenancy with PostgreSQL Row-Level Security',
      desc: 'Central control plane manages corporate entities, billing quotas, and SSL domains, while transactional data remains strictly partitioned via hardware RLS.',
      uiContent: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span className="font-mono text-cyan" style={{ fontSize: '13px' }}>RLS Session Context</span>
            <span className="font-mono text-emerald" style={{ fontWeight: 'bold' }}>SET LOCAL app.current_tenant_id</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span className="font-mono text-cyan" style={{ fontSize: '13px' }}>Schema Architecture</span>
            <span className="font-mono text-orange" style={{ fontWeight: 'bold' }}>Partitioned &amp; Dedicated DB Support</span>
          </div>
        </div>
      ),
      filename: 'backend/app/domains/auth/routers/registration.py',
      codeSnippet: `@router.post("/api/v1/superadmin/tenants/register", status_code=201)
def deploy_register_new_tenant(
    payload: TenantDeploymentRegistrationPayload,
    db: Session = Depends(get_db)
):
    # Provision isolated PostgreSQL schema and clone base tables
    db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{payload.domain_slug}";'))
    db.execute(text(f'CREATE TABLE IF NOT EXISTS "{payload.domain_slug}".users (LIKE public.users);'))
    
    tenant = TenantRecord(name=payload.company_name, slug=payload.domain_slug)
    db.add(tenant)
    db.commit()
    return {"status": "PROVISIONED", "namespace": f"{payload.domain_slug}.oxengl.me"}`,
    },
  };

  const curr = modules[activeModule];

  return (
    <section className="matrix-section" id="modules">
      <div className="section-header">
        <span className="section-pill">FULL-STACK ENTERPRISE WORKFLOWS</span>
        <h2 className="section-title">Core Operating Engines &amp; Architecture</h2>
        <p className="section-subtitle">A unified Saudi-first ERP engine pairing reactive interfaces with verified Python FastAPI backend endpoints.</p>
      </div>

      <div className="matrix-tabs">
        <button
          type="button"
          className={`matrix-tab ${activeModule === 'gl' ? 'active' : ''}`}
          onClick={() => setActiveModule('gl')}
        >
          General Ledger &amp; ZATCA
        </button>
        <button
          type="button"
          className={`matrix-tab ${activeModule === 'weighbridge' ? 'active' : ''}`}
          onClick={() => setActiveModule('weighbridge')}
        >
          Weighbridge &amp; Quarry Logistics
        </button>
        <button
          type="button"
          className={`matrix-tab ${activeModule === 'hrms' ? 'active' : ''}`}
          onClick={() => setActiveModule('hrms')}
        >
          HRMS &amp; WPS Payroll
        </button>
        <button
          type="button"
          className={`matrix-tab ${activeModule === 'tenancy' ? 'active' : ''}`}
          onClick={() => setActiveModule('tenancy')}
        >
          Two-Tier Multi-Tenancy
        </button>
      </div>

      <div className="matrix-container">
        <div className="matrix-ui-panel">
          <h3 className="matrix-ui-title">{curr.title}</h3>
          <p className="matrix-ui-desc">{curr.desc}</p>
          <div style={{ marginTop: '16px' }}>{curr.uiContent}</div>
        </div>

        <div className="matrix-code-panel">
          <div className="code-header">
            <span className="font-mono text-cyan" style={{ fontSize: '11px' }}>{curr.filename}</span>
            <span className="code-lang">PYTHON / FASTAPI</span>
          </div>
          <pre className="code-content">
            <code>{curr.codeSnippet}</code>
          </pre>
        </div>
      </div>
    </section>
  );
};
