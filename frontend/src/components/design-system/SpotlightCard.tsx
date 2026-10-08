import React, { useCallback, useRef } from 'react';

/**
 * SpotlightCard — OxenGL "Hover Lightable" surface (GLOBAL_UI_UX_OVERHAUL_SPEC.md, Standard 2).
 *
 * Two layered effects, both in the OxenGL orange/amber brand range:
 *  1. A linear sweep (`from-orange-500/0 via-orange-500/15 to-amber-500/0`) revealed on hover.
 *  2. An optional cursor-tracking radial glow driven by the `--spot-x` / `--spot-y` CSS variables
 *     (see `.oxen-spotlight` in index.css). Coordinates are written straight to the DOM node,
 *     so pointer movement never triggers a React re-render.
 *
 * `tone="platform"` applies the central-platform Deep Dark surface (slate-900 on slate-950).
 * `tone="inherit"` leaves background/border colours to the caller, so the card can be reused
 * inside tenant workspaces without overriding tenant branding.
 */
export type SpotlightTone = 'platform' | 'inherit';

export interface SpotlightCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  tone?: SpotlightTone;
  /** Enable the cursor-tracking radial glow (default: true). */
  trackCursor?: boolean;
  /** Show the hover linear sweep overlay (default: true). */
  sweep?: boolean;
  /** Extra classes for the inner content wrapper. */
  contentClassName?: string;
}

const TONE_CLASSES: Record<SpotlightTone, string> = {
  platform:
    'rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:border-orange-500/50',
  inherit: 'rounded-xl',
};

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  as: Component = 'div',
  tone = 'platform',
  trackCursor = true,
  sweep = true,
  className = '',
  contentClassName = '',
  onMouseMove,
  children,
  ...rest
}) => {
  const ref = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (trackCursor && ref.current) {
        const rect = ref.current.getBoundingClientRect();
        ref.current.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
        ref.current.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
      }
      onMouseMove?.(event);
    },
    [trackCursor, onMouseMove],
  );

  const classes = [
    'group relative overflow-hidden transition-all duration-300',
    trackCursor ? 'oxen-spotlight' : '',
    TONE_CLASSES[tone],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component ref={ref} className={classes} onMouseMove={handleMouseMove} {...rest}>
      {sweep && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px bg-gradient-to-r from-orange-500/0 via-orange-500/15 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
        />
      )}
      <div className={['relative z-10', contentClassName].filter(Boolean).join(' ')}>{children}</div>
    </Component>
  );
};

export default SpotlightCard;
