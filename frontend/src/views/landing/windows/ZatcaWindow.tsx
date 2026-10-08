import React, { useState } from 'react';

export const ZatcaWindow: React.FC = () => {
  const [debitAccount, setDebitAccount] = useState('110101');
  const [amount, setAmount] = useState('48500.00');
  const [statusText, setStatusText] = useState('CLEARED • ZATCA PHASE 2 API');
  const [statusTone, setStatusTone] = useState<'cleared' | 'committed'>('cleared');

  const amountVal = parseFloat(amount) || 0;
  const mockHash = (amountVal * 1234567).toString(16).padEnd(20, 'a').substring(0, 32);

  const handleCommit = () => {
    setStatusTone('committed');
    setStatusText('COMMITTED • POSTGRES 16 RLS APPLIED');
    setTimeout(() => {
      setStatusTone('cleared');
      setStatusText('CLEARED • ZATCA PHASE 2 API');
    }, 2800);
  };

  return (
    <div className="window-body">
      <div className="telemetry-bar">
        <span>TENANT: <strong style={{ color: 'var(--text-white)' }}>MEAYON-ENTERPRISE</strong></span>
        <span>RLS: <span className="text-emerald">ISOLATED</span></span>
        <span>SCHEMA: <span className="text-cyan">tenant_f7b38</span></span>
      </div>

      <div className="voucher-form">
        <div className="form-row">
          <div className="form-group">
            <label>VOUCHER TYPE</label>
            <input type="text" value="GL-VOUCHER-AUTO-CLEAR" readOnly />
          </div>
          <div className="form-group">
            <label>FISCAL DATE</label>
            <input type="text" value="2026-10-03 [Q4]" readOnly />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>DEBIT ACCOUNT</label>
            <select value={debitAccount} onChange={(e) => setDebitAccount(e.target.value)}>
              <option value="110101">110101 - Alinma Corporate Treasury</option>
              <option value="110201">110201 - SNB Operating Escrow</option>
              <option value="120101">120101 - Accounts Receivable [Trade]</option>
            </select>
          </div>
          <div className="form-group">
            <label>DEBIT AMOUNT (SAR)</label>
            <input
              type="number"
              value={amount}
              step="500"
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>BALANCED CREDIT ACCOUNT</label>
            <input type="text" value="410101 - Aggregate Sales Revenue [Crusher 01]" readOnly />
          </div>
          <div className="form-group">
            <label>CREDIT AMOUNT (SAR)</label>
            <input
              type="text"
              value={amountVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              readOnly
              style={{ color: 'var(--color-success)', fontWeight: 'bold' }}
            />
          </div>
        </div>

        <div className="zatca-panel">
          <div className="zatca-header">
            <span className="zatca-title">
              <span className="zatca-pulse" />
              ZATCA Phase 2 Cryptographic Validation Engine
            </span>
            <span
              className={`zatca-status ${statusTone === 'committed' ? 'text-cyan' : 'text-emerald'}`}
              style={{ fontSize: '11px', fontWeight: 'bold' }}
            >
              {statusText}
            </span>
          </div>
          <div className="hash-box font-mono" style={{ fontSize: '10px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>
            SHA256: 4a7e201b{mockHash}
          </div>
        </div>

        <button type="button" className="btn-primary" style={{ width: '100%', marginTop: '6px' }} onClick={handleCommit}>
          Commit Transaction &amp; Disseminate ZATCA Hash
        </button>
      </div>
    </div>
  );
};
