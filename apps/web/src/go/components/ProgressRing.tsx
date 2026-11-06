export function ProgressRing({ fraction, size = 290, stroke = 16, label, children }: { fraction: number; size?: number; stroke?: number; label: string; children?: React.ReactNode }) {
  const r = size / 2 - stroke - 14;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size, maxWidth: '100%' }}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 7} fill="none" stroke="#1E2C47" strokeWidth="1" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#24344F" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#00BF80"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
        />
        <circle cx={size / 2} cy={size / 2} r={r - stroke * 1.5} fill="#00BF80" opacity="0.08" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">{children}</div>
    </div>
  );
}
