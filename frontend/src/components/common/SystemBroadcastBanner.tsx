import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Radio,
  Wrench,
  X,
} from 'lucide-react';
import { SystemBroadcast, getActiveBroadcasts } from '../../services/governanceService';

interface SystemBroadcastBannerProps {
  className?: string;
  enableStream?: boolean;
}

export const SystemBroadcastBanner: React.FC<SystemBroadcastBannerProps> = ({
  className = '',
  enableStream = true,
}) => {
  const [broadcasts, setBroadcasts] = useState<SystemBroadcast[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const stored = sessionStorage.getItem('oxengl_dismissed_broadcasts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const loadActive = useCallback(async () => {
    try {
      const data = await getActiveBroadcasts();
      setBroadcasts(data);
    } catch {
      // Graceful fallback: maintain existing broadcasts
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadActive();
  }, [loadActive]);

  // Real-time SSE event stream listener
  useEffect(() => {
    if (!enableStream || typeof window === 'undefined' || !window.EventSource) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/v1/broadcasts/stream');

        eventSource.onmessage = (event) => {
          try {
            const data: SystemBroadcast[] = JSON.parse(event.data);
            if (Array.isArray(data)) {
              setBroadcasts(data);
            }
          } catch {
            // Ignore heartbeat or non-json keepalive comments
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Attempt reconnect after 10s
          reconnectTimeout = setTimeout(connectSSE, 10000);
        };
      } catch {
        // SSE not available or blocked
      }
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [enableStream]);

  // Filter out dismissed broadcasts
  const visibleBroadcasts = broadcasts.filter((b) => !dismissedIds.includes(b.id));

  // Keep index within bounds
  useEffect(() => {
    if (currentIndex >= visibleBroadcasts.length && visibleBroadcasts.length > 0) {
      setCurrentIndex(0);
    }
  }, [visibleBroadcasts.length, currentIndex]);

  const handleDismiss = (id: string) => {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    try {
      sessionStorage.setItem('oxengl_dismissed_broadcasts', JSON.stringify(next));
    } catch {
      // Local storage quota or sandbox fallback
    }
  };

  if (visibleBroadcasts.length === 0) {
    return null;
  }

  const active = visibleBroadcasts[currentIndex] || visibleBroadcasts[0];

  // Visual severity theme tokens
  const getSeverityStyles = (severity: SystemBroadcast['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          wrapper: 'bg-rose-950/90 border-b border-rose-800 text-rose-100 shadow-rose-950/50',
          badge: 'bg-rose-600 text-white font-bold',
          icon: <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 animate-pulse" />,
          title: 'text-rose-200',
        };
      case 'warning':
        return {
          wrapper: 'bg-amber-950/90 border-b border-amber-800 text-amber-100 shadow-amber-950/50',
          badge: 'bg-amber-600 text-white font-bold',
          icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />,
          title: 'text-amber-200',
        };
      case 'maintenance':
        return {
          wrapper: 'bg-sky-950/90 border-b border-sky-800 text-sky-100 shadow-sky-950/50',
          badge: 'bg-sky-600 text-white font-bold',
          icon: <Wrench className="h-4 w-4 shrink-0 text-sky-400" />,
          title: 'text-sky-200',
        };
      case 'info':
      default:
        return {
          wrapper: 'bg-slate-900/95 border-b border-slate-800 text-slate-100 shadow-slate-950/50',
          badge: 'bg-blue-600 text-white font-bold',
          icon: <Info className="h-4 w-4 shrink-0 text-blue-400" />,
          title: 'text-slate-200',
        };
    }
  };

  const currentStyles = getSeverityStyles(active.severity);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`relative z-50 flex w-full items-center justify-between px-4 py-2 text-xs backdrop-blur-md transition-all duration-200 ${currentStyles.wrapper} ${className}`}
    >
      <div className="flex flex-1 items-center gap-3 overflow-hidden">
        {/* Status indicator / Live icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {currentStyles.icon}
          <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${currentStyles.badge}`}>
            {active.severity}
          </span>
        </div>

        {/* Content payload */}
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span className={`font-bold shrink-0 truncate max-w-[200px] sm:max-w-[320px] ${currentStyles.title}`}>
            {active.title}:
          </span>
          <span className="truncate text-slate-200 text-[11px] sm:text-xs">
            {active.message}
          </span>
        </div>
      </div>

      {/* Controls: Pagination (if multiple) & Dismiss */}
      <div className="flex items-center gap-2 pl-3 shrink-0">
        {visibleBroadcasts.length > 1 && (
          <div className="flex items-center gap-1 bg-black/30 rounded-full px-2 py-0.5 text-[10px] text-slate-300">
            <button
              onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : visibleBroadcasts.length - 1))}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label="Previous announcement"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span>
              {currentIndex + 1}/{visibleBroadcasts.length}
            </span>
            <button
              onClick={() => setCurrentIndex((prev) => (prev < visibleBroadcasts.length - 1 ? prev + 1 : 0))}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label="Next announcement"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {active.is_dismissible && (
          <button
            onClick={() => handleDismiss(active.id)}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            aria-label="Dismiss announcement"
            title="Dismiss announcement"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
