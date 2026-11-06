import type { ReactNode } from 'react';
import { connectorTone, type ConnectorStatus } from '@achargex/shared';
import { cx } from '../lib/format';
import { TONE_DOT } from '../ui';

export function Panel({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('min-w-0 rounded-[16px] border border-ctl-line bg-ctl-panel', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-ctl-line px-4 py-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[1.3px] text-ctl-sub">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'green' | 'red' | 'amber' }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-ctl-line bg-ctl-panel px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-ctl-sub">{label}</p>
      <p className={cx('num mt-1 text-[22px] font-bold', tone === 'green' && 'text-ax-green', tone === 'red' && 'text-[#FF7A72]', tone === 'amber' && 'text-ax-deal')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-ctl-sub">{sub}</p>}
    </div>
  );
}

export function Dot({ status, online = true }: { status: ConnectorStatus; online?: boolean }) {
  const t = online ? connectorTone(status) : 'offline';
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_DOT[t] }} title={status} />;
}

export function CtlBadge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'green' | 'red' | 'amber' | 'muted' | 'blue' }) {
  const s = {
    green: 'bg-ax-green/15 text-ax-green',
    red: 'bg-[#C2413B]/20 text-[#FF8F88]',
    amber: 'bg-ax-deal/15 text-ax-deal',
    muted: 'bg-ctl-raised text-ctl-sub',
    blue: 'bg-[#2F6FED]/20 text-[#8FB3FF]',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[1px]', s)}>{children}</span>;
}

export function CtlButton({ children, tone = 'default', className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary' && 'bg-ax-green text-ax-navy hover:bg-[#00AD74]',
        tone === 'danger' && 'border border-[#C2413B]/50 text-[#FF8F88] hover:bg-[#C2413B]/15',
        tone === 'default' && 'border border-ctl-line text-ctl-text hover:bg-ctl-raised',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-[-0.4px] text-white">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-ctl-sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export const th = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[1.1px] text-ctl-sub';
export const td = 'px-3 py-2.5 align-middle';
