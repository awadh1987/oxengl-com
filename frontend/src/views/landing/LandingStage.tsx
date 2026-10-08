import React, { useState } from 'react';
import { ZatcaWindow } from './windows/ZatcaWindow';
import { TelemetryWindow } from './windows/TelemetryWindow';
import { WeighbridgeWindow } from './windows/WeighbridgeWindow';

interface StageWindowConfig {
  id: string;
  title: string;
  dotColor: string;
  /** Span the full grid row by default (wide content such as tables). */
  fullWidth: boolean;
  Body: React.FC;
}

/**
 * Windows are laid out in a responsive CSS grid (`.stage-canvas`) instead of
 * absolute positioning, so they can never overlap each other or the
 * surrounding page sections. Order here is the visual order in the grid.
 */
const STAGE_WINDOWS: StageWindowConfig[] = [
  {
    id: 'win-finance',
    title: 'GL-Voucher & ZATCA Phase 2 Cryptographic Validation Engine',
    dotColor: '#10b981',
    fullWidth: false,
    Body: ZatcaWindow,
  },
  {
    id: 'win-telemetry',
    title: 'Ubuntu 24.04 LTS & PostgreSQL 16 Telemetry Radar',
    dotColor: '#38bdf8',
    fullWidth: false,
    Body: TelemetryWindow,
  },
  {
    id: 'win-weighbridge',
    title: 'Weighbridge & Quarry Manifest Logistics Dispatch Table',
    dotColor: '#f97316',
    fullWidth: true,
    Body: WeighbridgeWindow,
  },
];

interface LandingStageProps {
  openWindows: Record<string, boolean>;
  activeWindow: string;
  onSelectWindow: (winId: string) => void;
  onCloseWindow: (winId: string) => void;
}

export const LandingStage: React.FC<LandingStageProps> = ({
  openWindows,
  activeWindow,
  onSelectWindow,
  onCloseWindow,
}) => {
  const [maximized, setMaximized] = useState<Record<string, boolean>>({});

  const toggleMaximize = (winId: string) => {
    setMaximized((prev) => ({ ...prev, [winId]: !prev[winId] }));
    onSelectWindow(winId);
  };

  const visibleWindows = STAGE_WINDOWS.filter((w) => openWindows[w.id]);

  return (
    <section className="stage-section" id="workspace-stage">
      <div className="stage-canvas" id="stage-canvas">
        {visibleWindows.map(({ id, title, dotColor, fullWidth, Body }) => {
          const classes = [
            'workspace-window',
            activeWindow === id ? 'active' : '',
            fullWidth ? 'span-full' : '',
            maximized[id] ? 'maximized' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={id} id={id} className={classes} onMouseDown={() => onSelectWindow(id)}>
              <div className="window-header">
                <div className="window-title">
                  <span className="window-dot" style={{ backgroundColor: dotColor }} />
                  <span>{title}</span>
                </div>
                <div className="window-controls">
                  <button type="button" className="ctrl-btn ctrl-min" onClick={() => onCloseWindow(id)} title="Minimize" aria-label={`Minimize ${title}`} />
                  <button type="button" className="ctrl-btn ctrl-max" onClick={() => toggleMaximize(id)} title="Maximize" aria-label={`Maximize ${title}`} />
                  <button type="button" className="ctrl-btn ctrl-close" onClick={() => onCloseWindow(id)} title="Close" aria-label={`Close ${title}`} />
                </div>
              </div>
              <Body />
            </div>
          );
        })}

        {visibleWindows.length === 0 && (
          <div className="stage-empty">All workspaces minimized — restore one from the dock above.</div>
        )}
      </div>
    </section>
  );
};
