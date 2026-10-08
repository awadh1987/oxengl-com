import React, { useState, useEffect } from 'react';

export const TelemetryWindow: React.FC = () => {
  const [cpu, setCpu] = useState(14.8);
  const [connections, setConnections] = useState(42);
  const [logs, setLogs] = useState<string[]>([
    '[20:12:01.042] [AUTH] Session verification (Argon2id) ok for tenant_f7b38',
    '[20:12:02.115] [POSTGRES] SET LOCAL app.current_tenant_id = f7b38b2f-... (0.32ms)',
    '[20:12:03.490] [ZATCA] Dispatched invoice INV-2026-9042 to clearance sandbox (12ms)',
    '[20:12:04.810] [RLS] Partitioned query scan complete on ledger_lines (4,820 rows)',
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCpu((prev) => +(12 + Math.random() * 8).toFixed(1));
      setConnections((prev) => Math.floor(38 + Math.random() * 10));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="window-body">
      <div className="telemetry-bar">
        <span>HOST: <strong style={{ color: 'var(--text-white)' }}>UBUNTU-24.04-LTS</strong></span>
        <span>ENGINE: <span className="text-cyan">PostgreSQL 16.4</span></span>
        <span>UPTIME: <span className="text-emerald">99.984%</span></span>
      </div>

      <div className="telemetry-grid">
        <div className="stat-card">
          <span className="stat-label">CPU LOAD</span>
          <span className="stat-val text-cyan font-mono">{cpu}%</span>
          <span className="stat-sub">8 Cores Active</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">CONN POOL</span>
          <span className="stat-val text-emerald font-mono">{connections} / 120</span>
          <span className="stat-sub">Hikari / PgBouncer</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">BUFFER HIT</span>
          <span className="stat-val text-orange font-mono">99.72%</span>
          <span className="stat-sub">Shared Buffers: 8GB</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">AVG LATENCY</span>
          <span className="stat-val text-emerald font-mono">0.42 ms</span>
          <span className="stat-sub">RLS Partition Index</span>
        </div>
      </div>

      <div className="terminal-radar">
        <div className="terminal-header font-mono">
          <span>● KERNEL AUDIT STREAM</span>
          <span>POSTGRESQL-16-MEAYON-NODE</span>
        </div>
        <div className="terminal-body font-mono">
          {logs.map((log, idx) => (
            <div key={idx} className="terminal-line">
              <span className="text-dim">$</span> {log}
            </div>
          ))}
          <div className="terminal-line text-emerald">
            <span className="text-dim">$</span> [LIVE] Awaiting next transaction event...
          </div>
        </div>
      </div>
    </div>
  );
};
