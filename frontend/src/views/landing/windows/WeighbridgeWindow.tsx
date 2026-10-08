import React, { useState } from 'react';

interface ScaleTicket {
  ticket: string;
  truck: string;
  driver: string;
  material: string;
  gross: number;
  tare: number;
  status: string;
}

export const WeighbridgeWindow: React.FC = () => {
  const [tickets, setTickets] = useState<ScaleTicket[]>([
    { ticket: 'WB-2026-0984', truck: '4120-JBD', driver: 'T. Al-Otaibi', material: 'Base Coarse 3/4"', gross: 42.45, tare: 14.20, status: 'DISPATCHED' },
    { ticket: 'WB-2026-0985', truck: '8910-KSA', driver: 'M. Salem', material: 'Washed Silica Sand', gross: 38.10, tare: 13.80, status: 'DISPATCHED' },
    { ticket: 'WB-2026-0986', truck: '3104-RHD', driver: 'K. Al-Ghamdi', material: 'Sub-Base Class A', gross: 45.80, tare: 15.10, status: 'SCALED' },
    { ticket: 'WB-2026-0987', truck: '7721-DAM', driver: 'A. Al-Zahrani', material: 'Crushed Aggregate', gross: 40.25, tare: 14.05, status: 'GATE_IN' },
  ]);

  const handleDispatchNew = () => {
    const nextNum = tickets.length + 988;
    const grossVal = +(38 + Math.random() * 8).toFixed(2);
    const tareVal = +(13 + Math.random() * 2).toFixed(2);
    const newRecord: ScaleTicket = {
      ticket: `WB-2026-0${nextNum}`,
      truck: `${Math.floor(1000 + Math.random() * 9000)}-KSA`,
      driver: 'F. Al-Shammari',
      material: 'Quarry Aggregate 1/2"',
      gross: grossVal,
      tare: tareVal,
      status: 'DISPATCHED',
    };
    setTickets([newRecord, ...tickets.slice(0, 5)]);
  };

  return (
    <div className="window-body">
      <div className="telemetry-bar">
        <span>QUARRY: <strong style={{ color: 'var(--text-white)' }}>AL-KHARJ NODE #02</strong></span>
        <span>SCALES: <span className="text-emerald">DUAL 80-TON ACTIVE</span></span>
        <span>MODE: <span className="text-orange">IOT STREAM</span></span>
      </div>

      <div className="weighbridge-table-wrapper">
        <table className="weighbridge-table">
          <thead>
            <tr>
              <th>TICKET</th>
              <th>TRUCK / DRIVER</th>
              <th>MATERIAL</th>
              <th>GROSS (T)</th>
              <th>TARE (T)</th>
              <th>NET (T)</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody id="weighbridge-rows">
            {tickets.map((t) => {
              const net = (t.gross - t.tare).toFixed(2);
              return (
                <tr key={t.ticket}>
                  <td className="font-mono text-cyan font-bold">{t.ticket}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.truck}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{t.driver}</div>
                  </td>
                  <td>{t.material}</td>
                  <td className="font-mono">{t.gross.toFixed(2)}</td>
                  <td className="font-mono">{t.tare.toFixed(2)}</td>
                  <td className="font-mono text-emerald font-bold">{net}</td>
                  <td>
                    <span className={`status-pill ${t.status === 'DISPATCHED' ? 'pill-green' : t.status === 'SCALED' ? 'pill-blue' : 'pill-orange'}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" style={{ fontSize: '12px', padding: '6px 14px' }} onClick={handleDispatchNew}>
          + Dispatch Simulated Scale Ticket
        </button>
      </div>
    </div>
  );
};
