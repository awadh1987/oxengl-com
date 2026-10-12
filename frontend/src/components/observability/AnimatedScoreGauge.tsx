import React, { useEffect, useState } from 'react';

interface AnimatedScoreGaugeProps {
  score: number;        // 0-100
  size?: number;        // px, default 120
  strokeWidth?: number; // px, default 10
  label?: string;
  className?: string;
}

/**
 * SVG radial arc gauge with smooth mount animation.
 * Score drives both arc length and colour (rose → amber → emerald).
 */
export const AnimatedScoreGauge: React.FC<AnimatedScoreGaugeProps> = ({
  score,
  size = 120,
  strokeWidth = 10,
  label,
  className = '',
}) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    // Brief delay so the arc animates from 0 on mount
    const timer = setTimeout(() => setAnimatedScore(score), 80);
    return () => clearTimeout(timer);
  }, [score]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (animatedScore / 100) * circumference * 0.75; // 270° arc
  const dashOffset = circumference * 0.75 - arcLength;

  // Colour based on score threshold
  const getColor = (s: number) => {
    if (s >= 80) return { stroke: '#10b981', glow: 'rgba(16,185,129,0.25)' };
    if (s >= 50) return { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.25)' };
    return { stroke: '#ef4444', glow: 'rgba(239,68,68,0.25)' };
  };

  const { stroke, glow } = getColor(animatedScore);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-[135deg]"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-zinc-200 dark:text-zinc-800"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeLinecap="round"
        />
        {/* Active arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.6s ease',
            filter: `drop-shadow(0 0 6px ${glow})`,
          }}
        />
      </svg>
      {/* Centre label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-extrabold font-mono tracking-tight"
          style={{ fontSize: size * 0.22, color: stroke, transition: 'color 0.6s ease' }}
        >
          {Math.round(animatedScore)}%
        </span>
        {label && (
          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
            {label}
          </span>
        )}
      </div>
    </div>
  );
};
