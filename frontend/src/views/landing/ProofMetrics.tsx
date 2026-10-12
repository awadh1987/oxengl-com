import React from 'react';

interface ProofMetricsProps {
  cmsMetrics?: {
    title?: string;
    subtitle?: string;
    metrics?: Array<{ label: string; value: string; change: string }>;
  };
}

export const ProofMetrics: React.FC<ProofMetricsProps> = ({ cmsMetrics }) => {
  const title = cmsMetrics?.title || 'Engineered for Sub-Millisecond Financial Execution';
  const subtitle = cmsMetrics?.subtitle || 'Real telemetry metrics captured from bare-metal PostgreSQL 16 clusters running in Saudi Arabian data centers.';
  const metricsList = cmsMetrics?.metrics && cmsMetrics.metrics.length > 0
    ? cmsMetrics.metrics
    : [
        { label: 'QUERY LATENCY', value: '0.42ms', change: 'P99 BENCHMARK' },
        { label: 'BUFFER HIT RATIO', value: '99.7%', change: 'POSTGRESQL 16' },
        { label: 'QUARTERLY VOLUME', value: '418.9M+ SAR', change: 'AUDITED 2026' },
        { label: 'ZATCA CLEARANCE', value: '< 14ms', change: 'PHASE 2 E-INVOICE' },
      ];

  return (
    <section className="proof-section" id="proof-metrics">
      <div className="section-header">
        <span className="section-pill">INFRASTRUCTURE BENCHMARKS</span>
        <h2 className="section-title">{title}</h2>
        <p className="section-subtitle">{subtitle}</p>
      </div>

      <div className="proof-grid">
        {metricsList.map((m, idx) => (
          <div key={idx} className="proof-card">
            <div className="proof-top">
              <span className="proof-label">{m.label}</span>
              <span className="proof-tag">{m.change}</span>
            </div>
            <div className="proof-value font-mono">{m.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
};
