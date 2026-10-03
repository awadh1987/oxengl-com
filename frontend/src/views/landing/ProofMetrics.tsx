import React from 'react';

export const ProofMetrics: React.FC = () => {
  return (
    <section className="proof-section" id="proof-metrics">
      <div className="section-header">
        <span className="section-pill">INFRASTRUCTURE BENCHMARKS</span>
        <h2 className="section-title">Engineered for Sub-Millisecond Financial Execution</h2>
        <p className="section-subtitle">Real telemetry metrics captured from bare-metal PostgreSQL 16 clusters running in Saudi Arabian data centers.</p>
      </div>

      <div className="proof-grid">
        <div className="proof-card">
          <div className="proof-top">
            <span className="proof-label">QUERY LATENCY</span>
            <span className="proof-tag">P99 BENCHMARK</span>
          </div>
          <div className="proof-value font-mono">0.42<span className="proof-unit">ms</span></div>
          <p className="proof-desc">Partitioned multi-tenant queries on 50M+ rows with composite index pruning.</p>
        </div>

        <div className="proof-card">
          <div className="proof-top">
            <span className="proof-label">BUFFER HIT RATIO</span>
            <span className="proof-tag">POSTGRESQL 16</span>
          </div>
          <div className="proof-value font-mono text-cyan">99.7<span className="proof-unit">%</span></div>
          <p className="proof-desc">Active ledger lines and operational accounts kept in blazing NVMe shared memory.</p>
        </div>

        <div className="proof-card">
          <div className="proof-top">
            <span className="proof-label">QUARTERLY VOLUME</span>
            <span className="proof-tag">AUDITED 2026</span>
          </div>
          <div className="proof-value font-mono text-emerald">418.9<span className="proof-unit">M+ SAR</span></div>
          <p className="proof-desc">Processed across mining concessions, aggregate logistics, and heavy contracting.</p>
        </div>

        <div className="proof-card">
          <div className="proof-top">
            <span className="proof-label">ZATCA CLEARANCE</span>
            <span className="proof-tag">PHASE 2 E-INVOICE</span>
          </div>
          <div className="proof-value font-mono text-orange">&lt; 14<span className="proof-unit">ms</span></div>
          <p className="proof-desc">Automated XML hashing, ECDSA signing, and sandbox clearance validation.</p>
        </div>
      </div>
    </section>
  );
};
