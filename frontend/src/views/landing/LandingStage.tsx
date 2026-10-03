import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZatcaWindow } from './windows/ZatcaWindow';
import { TelemetryWindow } from './windows/TelemetryWindow';
import { WeighbridgeWindow } from './windows/WeighbridgeWindow';

interface WindowState {
  id: string;
  title: string;
  dotColor: string;
  top: number;
  left: number;
  width: number;
  height: number;
  zIndex: number;
  isMaximized: boolean;
  isMinimized: boolean;
  prevBounds?: { top: number; left: number; width: number; height: number };
}

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
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [windows, setWindows] = useState<Record<string, WindowState>>({
    'win-finance': {
      id: 'win-finance',
      title: 'GL-Voucher & ZATCA Phase 2 Cryptographic Validation Engine',
      dotColor: '#10b981',
      top: 24,
      left: 24,
      width: 440,
      height: 390,
      zIndex: 20,
      isMaximized: false,
      isMinimized: false,
    },
    'win-telemetry': {
      id: 'win-telemetry',
      title: 'Ubuntu 24.04 LTS & PostgreSQL 16 Telemetry Radar',
      dotColor: '#38bdf8',
      top: 24,
      left: 488,
      width: 430,
      height: 390,
      zIndex: 21,
      isMaximized: false,
      isMinimized: false,
    },
    'win-weighbridge': {
      id: 'win-weighbridge',
      title: 'Weighbridge & Quarry Manifest Logistics Dispatch Table',
      dotColor: '#f97316',
      top: 220,
      left: 260,
      width: 560,
      height: 380,
      zIndex: 22,
      isMaximized: false,
      isMinimized: false,
    },
  });

  const [highestZ, setHighestZ] = useState(25);
  const dragRef = useRef<{
    winId: string;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const resizeRef = useRef<{
    winId: string;
    handle: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const bringToFront = useCallback((winId: string) => {
    setHighestZ((prevZ) => {
      const nextZ = prevZ + 1;
      setWindows((prev) => ({
        ...prev,
        [winId]: { ...prev[winId], zIndex: nextZ },
      }));
      return nextZ;
    });
    onSelectWindow(winId);
  }, [onSelectWindow]);

  const toggleMaximize = (winId: string) => {
    setWindows((prev) => {
      const win = prev[winId];
      if (!win) return prev;
      if (win.isMaximized && win.prevBounds) {
        return {
          ...prev,
          [winId]: {
            ...win,
            ...win.prevBounds,
            isMaximized: false,
          },
        };
      } else {
        const bounds = { top: win.top, left: win.left, width: win.width, height: win.height };
        return {
          ...prev,
          [winId]: {
            ...win,
            prevBounds: bounds,
            top: 10,
            left: 10,
            width: stageRef.current ? stageRef.current.clientWidth - 20 : 800,
            height: stageRef.current ? stageRef.current.clientHeight - 20 : 500,
            isMaximized: true,
          },
        };
      }
    });
    bringToFront(winId);
  };

  const handleDragStart = (e: React.MouseEvent, winId: string) => {
    if ((e.target as HTMLElement).closest('.ctrl-btn')) return;
    bringToFront(winId);
    const win = windows[winId];
    if (!win || win.isMaximized) return;

    dragRef.current = {
      winId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: win.left,
      startTop: win.top,
    };
  };

  const handleResizeStart = (e: React.MouseEvent, winId: string, handle: string) => {
    e.stopPropagation();
    bringToFront(winId);
    const win = windows[winId];
    if (!win || win.isMaximized) return;

    resizeRef.current = {
      winId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: win.width,
      startHeight: win.height,
      startLeft: win.left,
      startTop: win.top,
    };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // 1. Dragging
      if (dragRef.current && stageRef.current) {
        const { winId, startX, startY, startLeft, startTop } = dragRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const stageW = stageRef.current.clientWidth;
        const stageH = stageRef.current.clientHeight;

        setWindows((prev) => {
          const w = prev[winId];
          if (!w) return prev;
          const maxLeft = Math.max(0, stageW - w.width);
          const maxTop = Math.max(0, stageH - w.height);
          const nextLeft = Math.max(0, Math.min(startLeft + dx, maxLeft));
          const nextTop = Math.max(0, Math.min(startTop + dy, maxTop));
          return {
            ...prev,
            [winId]: { ...w, left: nextLeft, top: nextTop },
          };
        });
      }

      // 2. Resizing
      if (resizeRef.current && stageRef.current) {
        const { winId, handle, startX, startY, startWidth, startHeight, startLeft, startTop } = resizeRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        setWindows((prev) => {
          const w = prev[winId];
          if (!w) return prev;
          let newW = startWidth;
          let newH = startHeight;
          let newLeft = startLeft;
          let newTop = startTop;

          if (handle.includes('r')) newW = Math.max(320, startWidth + dx);
          if (handle.includes('b')) newH = Math.max(260, startHeight + dy);
          if (handle.includes('l')) {
            const proposedW = startWidth - dx;
            if (proposedW >= 320) {
              newW = proposedW;
              newLeft = startLeft + dx;
            }
          }
          if (handle.includes('t')) {
            const proposedH = startHeight - dy;
            if (proposedH >= 260) {
              newH = proposedH;
              newTop = startTop + dy;
            }
          }

          return {
            ...prev,
            [winId]: { ...w, width: newW, height: newH, left: newLeft, top: newTop },
          };
        });
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <section className="stage-section" id="workspace-stage">
      <div className="stage-canvas" id="stage-canvas" ref={stageRef}>
        {/* Window 1: Finance & ZATCA */}
        {openWindows['win-finance'] && (
          <div
            id="win-finance"
            className={`workspace-window ${activeWindow === 'win-finance' ? 'active' : ''}`}
            style={{
              top: `${windows['win-finance'].top}px`,
              left: `${windows['win-finance'].left}px`,
              width: `${windows['win-finance'].width}px`,
              height: `${windows['win-finance'].height}px`,
              zIndex: windows['win-finance'].zIndex,
            }}
            onMouseDown={() => bringToFront('win-finance')}
          >
            <div className="window-header" onMouseDown={(e) => handleDragStart(e, 'win-finance')}>
              <div className="window-title">
                <span className="window-dot" style={{ backgroundColor: windows['win-finance'].dotColor }} />
                <span>{windows['win-finance'].title}</span>
              </div>
              <div className="window-controls">
                <button type="button" className="ctrl-btn ctrl-min" onClick={() => onCloseWindow('win-finance')} title="Minimize" />
                <button type="button" className="ctrl-btn ctrl-max" onClick={() => toggleMaximize('win-finance')} title="Maximize" />
                <button type="button" className="ctrl-btn ctrl-close" onClick={() => onCloseWindow('win-finance')} title="Close" />
              </div>
            </div>
            <ZatcaWindow />
            <div className="resizer r-e" onMouseDown={(e) => handleResizeStart(e, 'win-finance', 'r')} />
            <div className="resizer r-s" onMouseDown={(e) => handleResizeStart(e, 'win-finance', 'b')} />
            <div className="resizer r-se" onMouseDown={(e) => handleResizeStart(e, 'win-finance', 'rb')} />
          </div>
        )}

        {/* Window 2: Telemetry Radar */}
        {openWindows['win-telemetry'] && (
          <div
            id="win-telemetry"
            className={`workspace-window ${activeWindow === 'win-telemetry' ? 'active' : ''}`}
            style={{
              top: `${windows['win-telemetry'].top}px`,
              left: `${windows['win-telemetry'].left}px`,
              width: `${windows['win-telemetry'].width}px`,
              height: `${windows['win-telemetry'].height}px`,
              zIndex: windows['win-telemetry'].zIndex,
            }}
            onMouseDown={() => bringToFront('win-telemetry')}
          >
            <div className="window-header" onMouseDown={(e) => handleDragStart(e, 'win-telemetry')}>
              <div className="window-title">
                <span className="window-dot" style={{ backgroundColor: windows['win-telemetry'].dotColor }} />
                <span>{windows['win-telemetry'].title}</span>
              </div>
              <div className="window-controls">
                <button type="button" className="ctrl-btn ctrl-min" onClick={() => onCloseWindow('win-telemetry')} title="Minimize" />
                <button type="button" className="ctrl-btn ctrl-max" onClick={() => toggleMaximize('win-telemetry')} title="Maximize" />
                <button type="button" className="ctrl-btn ctrl-close" onClick={() => onCloseWindow('win-telemetry')} title="Close" />
              </div>
            </div>
            <TelemetryWindow />
            <div className="resizer r-e" onMouseDown={(e) => handleResizeStart(e, 'win-telemetry', 'r')} />
            <div className="resizer r-s" onMouseDown={(e) => handleResizeStart(e, 'win-telemetry', 'b')} />
            <div className="resizer r-se" onMouseDown={(e) => handleResizeStart(e, 'win-telemetry', 'rb')} />
          </div>
        )}

        {/* Window 3: Weighbridge Logistics */}
        {openWindows['win-weighbridge'] && (
          <div
            id="win-weighbridge"
            className={`workspace-window ${activeWindow === 'win-weighbridge' ? 'active' : ''}`}
            style={{
              top: `${windows['win-weighbridge'].top}px`,
              left: `${windows['win-weighbridge'].left}px`,
              width: `${windows['win-weighbridge'].width}px`,
              height: `${windows['win-weighbridge'].height}px`,
              zIndex: windows['win-weighbridge'].zIndex,
            }}
            onMouseDown={() => bringToFront('win-weighbridge')}
          >
            <div className="window-header" onMouseDown={(e) => handleDragStart(e, 'win-weighbridge')}>
              <div className="window-title">
                <span className="window-dot" style={{ backgroundColor: windows['win-weighbridge'].dotColor }} />
                <span>{windows['win-weighbridge'].title}</span>
              </div>
              <div className="window-controls">
                <button type="button" className="ctrl-btn ctrl-min" onClick={() => onCloseWindow('win-weighbridge')} title="Minimize" />
                <button type="button" className="ctrl-btn ctrl-max" onClick={() => toggleMaximize('win-weighbridge')} title="Maximize" />
                <button type="button" className="ctrl-btn ctrl-close" onClick={() => onCloseWindow('win-weighbridge')} title="Close" />
              </div>
            </div>
            <WeighbridgeWindow />
            <div className="resizer r-e" onMouseDown={(e) => handleResizeStart(e, 'win-weighbridge', 'r')} />
            <div className="resizer r-s" onMouseDown={(e) => handleResizeStart(e, 'win-weighbridge', 'b')} />
            <div className="resizer r-se" onMouseDown={(e) => handleResizeStart(e, 'win-weighbridge', 'rb')} />
          </div>
        )}
      </div>
    </section>
  );
};
