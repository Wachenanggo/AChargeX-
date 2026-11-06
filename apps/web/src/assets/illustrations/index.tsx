/**
 * AChargeX original illustration set — flat, navy/green, rounded (matches design-references).
 * All SVGs are hand-built for this project; no third-party artwork.
 */
import type { ConnectorType, Vehicle } from '@achargex/shared';

const NAVY = '#192338';
const GREEN = '#00BF80';

// ------------------------------------------------------------ Connector pictograms
/** Plug face pictograms with realistic pin layouts. */
export function ConnectorIcon({ type, size = 32, color = NAVY, className }: { type: ConnectorType; size?: number; color?: string; className?: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.6 } as const;
  const pin = (cx: number, cy: number, r: number) => <circle cx={cx} cy={cy} r={r} fill={color} />;
  let body: JSX.Element;
  switch (type) {
    case 'Type2':
      body = (
        <>
          <path d="M6 9.5h20a11 11 0 0 1-20 0z" {...s} />
          <path d="M6 9.5a10 10 0 0 0 20 0" {...s} />
          <path d="M6.2 9.5 C6.2 9.5 9 6 16 6 S25.8 9.5 25.8 9.5" {...s} />
          {pin(12.5, 9.8, 1)}
          {pin(19.5, 9.8, 1)}
          {pin(10, 14, 1.6)}
          {pin(16, 14, 1.6)}
          {pin(22, 14, 1.6)}
          {pin(13, 19, 1.6)}
          {pin(19, 19, 1.6)}
        </>
      );
      break;
    case 'CCS2':
      body = (
        <>
          <path d="M7 5.5 C7 5.5 10 3 16 3 S25 5.5 25 5.5 a9 8 0 0 1 -18 0z" {...s} />
          {pin(12.5, 6, 0.9)}
          {pin(19.5, 6, 0.9)}
          {pin(11, 10, 1.3)}
          {pin(16, 10.5, 1.3)}
          {pin(21, 10, 1.3)}
          <rect x="8" y="17" width="16" height="11" rx="5.5" {...s} />
          {pin(12.5, 22.5, 2.4)}
          {pin(19.5, 22.5, 2.4)}
        </>
      );
      break;
    case 'CHAdeMO':
      body = (
        <>
          <circle cx="16" cy="16" r="12" {...s} />
          <circle cx="16" cy="16" r="9" {...s} strokeWidth={1} />
          {pin(11, 16, 2.6)}
          {pin(21, 16, 2.6)}
          {pin(16, 9.5, 1)}
          {pin(16, 22.5, 1)}
          {pin(12.5, 11, 0.9)}
          {pin(19.5, 11, 0.9)}
          {pin(12.5, 21, 0.9)}
          {pin(19.5, 21, 0.9)}
        </>
      );
      break;
    case 'GBT':
      body = (
        <>
          <circle cx="16" cy="16" r="12" {...s} />
          {pin(11, 18, 2.6)}
          {pin(21, 18, 2.6)}
          {pin(16, 9, 1.4)}
          {pin(11, 11, 1)}
          {pin(21, 11, 1)}
          {pin(16, 15, 1)}
          {pin(16, 22.5, 1)}
        </>
      );
      break;
    case 'Type1':
      body = (
        <>
          <path d="M5 15a11 11 0 1 1 22 0v4H5z" {...s} />
          {pin(11, 12, 1.8)}
          {pin(21, 12, 1.8)}
          {pin(16, 19, 1.8)}
          {pin(12, 18, 0.9)}
          {pin(20, 18, 0.9)}
        </>
      );
      break;
    case 'CCS1':
      body = (
        <>
          <path d="M7 11a9 8 0 1 1 18 0v2H7z" {...s} />
          {pin(12, 9, 1.3)}
          {pin(20, 9, 1.3)}
          {pin(16, 12.5, 1.3)}
          <rect x="8" y="17" width="16" height="11" rx="5.5" {...s} />
          {pin(12.5, 22.5, 2.4)}
          {pin(19.5, 22.5, 2.4)}
        </>
      );
      break;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label={`${type} connector`}>
      {body}
    </svg>
  );
}

// ------------------------------------------------------------ Vehicles
/** Side-profile vehicle silhouettes. */
export function VehicleArt({ body, width = 120, className, accent = GREEN, onDark = false }: { body: Vehicle['bodyType']; width?: number; className?: string; accent?: string; onDark?: boolean }) {
  const h = width * 0.42;
  const shapes: Record<Vehicle['bodyType'], string> = {
    sedan: 'M8 34 C8 30 10 28 14 27 L28 25 C34 18 42 14 54 14 L76 14 C86 14 92 18 99 25 L110 27 C115 28 116 31 116 34 L116 38 L8 38 Z',
    hatch: 'M8 34 C8 30 10 28 14 27 L26 24 C32 16 40 12 52 12 L80 12 C90 12 98 16 104 24 L110 27 C114 29 115 31 115 34 L115 38 L8 38 Z',
    suv: 'M7 34 C7 29 9 26 14 25 L24 23 C30 14 38 9 50 9 L86 9 C96 9 102 13 107 22 L112 25 C116 27 117 30 117 34 L117 38 L7 38 Z',
    van: 'M7 34 C7 29 9 26 14 25 L22 22 C26 12 32 7 44 7 L100 7 C108 7 113 12 114 20 L116 26 C117 29 117 31 117 34 L117 38 L7 38 Z',
    trike: 'M20 34 L22 20 C23 14 28 10 36 10 L84 10 C92 10 98 14 100 20 L104 34 L104 38 L20 38 Z',
  };
  const windows: Record<Vehicle['bodyType'], string> = {
    sedan: 'M34 25 C38 20 44 17 54 17 L62 17 L62 25 Z M66 17 L76 17 C84 17 89 20 94 25 L66 25 Z',
    hatch: 'M32 24 C37 18 43 15 52 15 L62 15 L62 24 Z M66 15 L80 15 C88 15 94 18 99 24 L66 24 Z',
    suv: 'M30 22 C35 15 41 12 50 12 L64 12 L64 22 Z M68 12 L86 12 C94 12 99 15 102 22 L68 22 Z',
    van: 'M28 21 C31 14 36 10 44 10 L60 10 L60 21 Z M64 10 L104 10 L108 21 L64 21 Z',
    trike: 'M30 26 L32 18 C33 15 35 13 40 13 L58 13 L58 26 Z M62 13 L80 13 C86 13 90 15 92 20 L94 26 L62 26 Z',
  };
  const wheels: Record<Vehicle['bodyType'], [number, number]> = {
    sedan: [30, 94],
    hatch: [30, 92],
    suv: [30, 94],
    van: [28, 96],
    trike: [32, 92],
  };
  const [w1, w2] = wheels[body];
  return (
    <svg width={width} height={h} viewBox="0 0 124 52" className={className} role="img" aria-label={`${body} vehicle`}>
      <ellipse cx="62" cy="47" rx="54" ry="3" fill={onDark ? '#000' : '#192338'} opacity={onDark ? 0.25 : 0.08} />
      <path d={shapes[body]} fill={onDark ? '#E3EAF4' : NAVY} />
      <path d={windows[body]} fill={onDark ? '#5E6F86' : '#9FB0C8'} opacity={onDark ? 0.9 : 0.55} />
      <rect x="10" y="31" width="104" height="2.5" rx="1.25" fill={accent} />
      {[w1, w2].map((x) => (
        <g key={x}>
          <circle cx={x} cy="40" r="8.5" fill="#111A2B" />
          <circle cx={x} cy="40" r="4" fill="#DCE4EF" />
        </g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------ Station
export function StationArt({ width = 160, className }: { width?: number; className?: string }) {
  return (
    <svg width={width} height={width * 0.75} viewBox="0 0 160 120" className={className} role="img" aria-label="EV charging station">
      <rect x="0" y="100" width="160" height="20" rx="4" fill="#E1EAF0" />
      <rect x="10" y="20" width="140" height="10" rx="5" fill={NAVY} />
      <rect x="20" y="30" width="6" height="70" fill="#C9D5DF" />
      <rect x="134" y="30" width="6" height="70" fill="#C9D5DF" />
      {[42, 92].map((x) => (
        <g key={x}>
          <rect x={x} y="44" width="26" height="56" rx="7" fill="#fff" stroke={NAVY} strokeWidth="2" />
          <rect x={x + 5} y="50" width="16" height="12" rx="3" fill={NAVY} />
          <path d={`M${x + 14} 52 l-4 6 h3 l-1 4 4-6 h-3z`} fill={GREEN} />
          <circle cx={x + 13} cy="74" r="4" fill={GREEN} />
          <path d={`M${x + 26} 70 q10 6 6 22`} fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="80" cy="25" r="9" fill={GREEN} />
      <path d="M81 19 75 27h4l-1 5 6-8h-4z" fill={NAVY} />
    </svg>
  );
}

// ------------------------------------------------------------ Onboarding scenes
export function OnboardingScene({ step }: { step: number }) {
  return (
    <svg viewBox="0 0 350 420" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <circle cx="175" cy="210" r="150" fill="none" stroke="#2A3A55" />
      <circle cx="175" cy="210" r="100" fill="none" stroke="#2A3A55" />
      <circle cx="175" cy="210" r="56" fill={GREEN} opacity=".12" />
      <g fill="#20304A">
        <rect x="0" y="250" width="40" height="170" />
        <rect x="44" y="210" width="34" height="210" />
        <rect x="82" y="270" width="46" height="150" />
        <rect x="232" y="230" width="38" height="190" />
        <rect x="274" y="190" width="30" height="230" />
        <rect x="308" y="260" width="42" height="160" />
      </g>
      <path d="M0 360 Q120 330 230 345 T350 340 L350 420 L0 420 Z" fill="#111A2B" />
      <path d="M0 360 Q120 330 230 345 T350 340" fill="none" stroke="#3B4C6E" strokeWidth="2" />
      {step === 1 && (
        <g>
          {[
            [110, 150],
            [240, 175],
            [150, 260],
            [220, 120],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <path d="M0 -22 a14 14 0 0 1 14 14 c0 10 -14 24 -14 24 s-14 -14 -14 -24 a14 14 0 0 1 14 -14z" fill={i === 0 ? GREEN : '#2F6FED'} transform="translate(0 0)" />
              <circle cx="0" cy="-8" r="5" fill="#fff" />
            </g>
          ))}
        </g>
      )}
      {step === 2 && (
        <g transform="translate(125 140)">
          <rect width="100" height="100" rx="14" fill="#fff" />
          {[
            [12, 12],
            [62, 12],
            [12, 62],
          ].map(([x, y], i) => (
            <g key={i}>
              <rect x={x} y={y} width="26" height="26" rx="4" fill={NAVY} />
              <rect x={x + 7} y={y + 7} width="12" height="12" rx="2" fill="#fff" />
            </g>
          ))}
          <rect x="66" y="66" width="10" height="10" fill={NAVY} />
          <rect x="80" y="80" width="10" height="10" fill={NAVY} />
          <rect x="-8" y="48" width="116" height="4" rx="2" fill={GREEN} />
        </g>
      )}
      {step === 3 && (
        <g transform="translate(175 200)">
          <circle r="70" fill="none" stroke="#24344F" strokeWidth="14" />
          <circle r="70" fill="none" stroke={GREEN} strokeWidth="14" strokeLinecap="round" strokeDasharray="300 440" transform="rotate(-90)" />
          <path d="M4 -24 -14 4h12l-3 20 18-28h-12z" fill={GREEN} />
        </g>
      )}
      {step === 4 && (
        <g transform="translate(110 150)">
          <rect width="130" height="150" rx="14" fill="#fff" />
          <rect x="16" y="18" width="60" height="8" rx="4" fill={NAVY} />
          {[44, 64, 84].map((y) => (
            <g key={y}>
              <rect x="16" y={y} width="70" height="6" rx="3" fill="#C9D5DF" />
              <rect x="96" y={y} width="18" height="6" rx="3" fill="#C9D5DF" />
            </g>
          ))}
          <rect x="16" y="112" width="98" height="20" rx="10" fill={GREEN} />
        </g>
      )}
    </svg>
  );
}

// ------------------------------------------------------------ Empty states
export function EmptyArt({ kind }: { kind: 'stations' | 'vehicles' | 'sessions' | 'payments' | 'offline' | 'search' }) {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" role="img" aria-label="">
      <ellipse cx="60" cy="86" rx="44" ry="6" fill="#192338" opacity=".06" />
      <circle cx="60" cy="44" r="36" fill="#E3F8EF" />
      {kind === 'stations' && (
        <g transform="translate(44 18)">
          <rect width="32" height="50" rx="8" fill="#fff" stroke={NAVY} strokeWidth="2.5" />
          <rect x="6" y="7" width="20" height="14" rx="3" fill={NAVY} />
          <path d="M17 9 12 16h4l-1 4 5-7h-4z" fill={GREEN} />
          <circle cx="16" cy="34" r="5" fill={GREEN} />
        </g>
      )}
      {kind === 'vehicles' && (
        <g transform="translate(22 30)">
          <VehicleArtInline />
        </g>
      )}
      {kind === 'sessions' && (
        <g transform="translate(60 44)">
          <circle r="22" fill="none" stroke="#C9D5DF" strokeWidth="6" />
          <circle r="22" fill="none" stroke={GREEN} strokeWidth="6" strokeDasharray="40 140" strokeLinecap="round" transform="rotate(-90)" />
          <path d="M2 -9 -6 2h5l-1 7 8-11h-5z" fill={NAVY} />
        </g>
      )}
      {kind === 'payments' && (
        <g transform="translate(34 26)">
          <rect width="52" height="36" rx="7" fill={NAVY} />
          <rect y="9" width="52" height="7" fill="#3B4C6E" />
          <rect x="34" y="24" width="10" height="5" rx="2" fill={GREEN} />
        </g>
      )}
      {kind === 'offline' && (
        <g transform="translate(60 44)" fill="none" stroke={NAVY} strokeWidth="3" strokeLinecap="round">
          <path d="M-20 -6 a28 28 0 0 1 40 0" />
          <path d="M-12 2 a17 17 0 0 1 24 0" />
          <circle cx="0" cy="11" r="2.5" fill={NAVY} />
          <path d="M-22 -18 22 22" stroke="#C2413B" />
        </g>
      )}
      {kind === 'search' && (
        <g transform="translate(60 44)" fill="none" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round">
          <circle cx="-4" cy="-4" r="14" />
          <path d="m7 7 10 10" />
        </g>
      )}
    </svg>
  );
}

function VehicleArtInline() {
  return (
    <g transform="scale(0.62)">
      <path d="M8 34 C8 30 10 28 14 27 L26 24 C32 16 40 12 52 12 L80 12 C90 12 98 16 104 24 L110 27 C114 29 115 31 115 34 L115 38 L8 38 Z" fill={NAVY} />
      <circle cx="30" cy="40" r="8.5" fill="#111A2B" />
      <circle cx="92" cy="40" r="8.5" fill="#111A2B" />
      <circle cx="30" cy="40" r="4" fill="#DCE4EF" />
      <circle cx="92" cy="40" r="4" fill="#DCE4EF" />
    </g>
  );
}
