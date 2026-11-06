import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { X, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { connectorTone, TONE_LABEL, type ConnectorStatus, type StatusTone } from '@achargex/shared';
import { cx } from '../lib/format';

// ---------------------------------------------------------------- Logo
export function BoltMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center justify-center rounded-[8px] bg-ax-green', className)} style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="#192338">
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      </svg>
    </span>
  );
}

export function Logo({ dark = false, size = 20, className }: { dark?: boolean; size?: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-extrabold tracking-[-0.5px]', className)} style={{ fontSize: size }}>
      <BoltMark size={Math.round(size * 1.3)} />
      <span className={dark ? 'text-white' : 'text-ax-navy'}>
        ACharge<span className={dark ? 'text-ax-green' : 'text-ax-green-text'}>X</span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'charge' | 'secondary' | 'ghost' | 'danger' | 'dark';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-ax-navy text-white hover:bg-[#223050] disabled:bg-[#9AA5B6]',
  charge: 'bg-ax-green text-ax-navy hover:bg-[#00AD74] disabled:bg-[#9ADFC6] disabled:text-ax-navy/60',
  secondary: 'bg-white text-ax-navy border border-ax-border hover:bg-ax-surface disabled:text-ax-muted',
  ghost: 'bg-transparent text-ax-navy hover:bg-ax-surface',
  danger: 'bg-ax-busy text-white hover:bg-[#8E2722] disabled:opacity-60',
  dark: 'bg-ax-navy-card text-white border-[1.5px] border-[#3B4C6E] hover:bg-[#22314F] disabled:opacity-60',
};
const SIZE = { sm: 'h-9 px-4 text-[13px]', md: 'h-12 px-5 text-[15px]', lg: 'h-14 px-6 text-base' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZE;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', block, className, children, icon, ...rest }: LinkProps & { variant?: Variant; size?: keyof typeof SIZE; block?: boolean; icon?: ReactNode }) {
  return (
    <Link
      className={cx('inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors', VARIANT[variant], SIZE[size], block && 'w-full', className)}
      {...rest}
    >
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, dark, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; dark?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border transition-colors',
        dark ? 'border-ax-navy bg-ax-navy text-white hover:bg-[#223050]' : 'border-ax-border bg-white text-ax-navy hover:bg-ax-surface',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Card
export function Card({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' } & Record<string, unknown>) {
  return (
    <As className={cx('rounded-card border border-ax-border bg-white', className)} {...rest}>
      {children}
    </As>
  );
}

// ---------------------------------------------------------------- Chip
export function Chip({ active, children, className, dot, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; dot?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[18px] px-3.5 text-[13px] font-semibold transition-colors',
        active ? 'bg-ax-navy text-white' : 'border border-ax-border bg-white text-ax-navy hover:bg-ax-surface',
        className,
      )}
      {...rest}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Input
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string; leading?: ReactNode }>(
  function Input({ label, hint, error, leading, className, id, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className={cx('flex flex-col gap-1.5', className)}>
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-semibold text-ax-navy">
            {label}
          </label>
        )}
        <div className={cx('flex h-12 items-center gap-2 rounded-[14px] border bg-white px-3.5 focus-within:border-ax-green', error ? 'border-ax-busy' : 'border-ax-border')}>
          {leading}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={error || hint ? `${inputId}-d` : undefined}
            className="h-full w-full min-w-0 bg-transparent text-[15px] text-ax-navy outline-none placeholder:text-ax-muted"
            {...rest}
          />
        </div>
        {(error || hint) && (
          <p id={`${inputId}-d`} className={cx('text-[12px]', error ? 'text-ax-busy' : 'text-ax-muted')}>
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);

export function Select({ label, children, className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-semibold">
          {label}
        </label>
      )}
      <select id={id} className="h-12 rounded-[14px] border border-ax-border bg-white px-3 text-[15px] outline-none focus:border-ax-green" {...rest}>
        {children}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------- Status
const TONE_STYLE: Record<StatusTone, string> = {
  available: 'bg-ax-mint text-ax-green-text',
  busy: 'bg-ax-busy-bg text-ax-busy',
  reserved: 'bg-ax-reserved-bg text-ax-reserved',
  fault: 'bg-[#FFF4E5] text-[#8A4B00]',
  offline: 'bg-ax-surface text-ax-muted',
  unknown: 'bg-ax-surface text-ax-muted',
};
export const TONE_DOT: Record<StatusTone, string> = {
  available: '#00BF80',
  busy: '#C2413B',
  reserved: '#2F6FED',
  fault: '#E08A00',
  offline: '#9AA5B6',
  unknown: '#9AA5B6',
};

export function StatusBadge({ status, tone, label, className }: { status?: ConnectorStatus; tone?: StatusTone; label?: string; className?: string }) {
  const t = tone ?? (status ? connectorTone(status) : 'unknown');
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.1px]', TONE_STYLE[t], className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_DOT[t] }} aria-hidden />
      {label ?? TONE_LABEL[t]}
    </span>
  );
}

export function DemoBadge({ label = 'DEMO', dark, className }: { label?: string; dark?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-[1.2px]',
        dark ? 'bg-ax-deal text-ax-navy' : 'bg-ax-navy text-white',
        className,
      )}
      title="Demonstration data — not a real station, payment or charger"
    >
      {label}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-[1px]', className)}>{children}</span>;
}

// ---------------------------------------------------------------- Feedback
export function Notice({ tone = 'info', title, children, className, dark }: { tone?: 'info' | 'warn' | 'error' | 'success'; title?: string; children?: ReactNode; className?: string; dark?: boolean }) {
  const Icon = tone === 'error' || tone === 'warn' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;
  const style = dark
    ? 'bg-ctl-raised text-ctl-text border-ctl-line'
    : {
        info: 'bg-ax-surface text-ax-navy border-ax-border',
        warn: 'bg-ax-deal-bg text-ax-deal-text border-[#F3DFA9]',
        error: 'bg-ax-busy-bg text-ax-busy border-[#F2CFCB]',
        success: 'bg-ax-mint text-ax-green-deep border-ax-mint-strong',
      }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-2.5 rounded-[14px] border p-3 text-[13px] leading-relaxed', style, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-ax-surface', className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-ax-green-text', className)} aria-label="Loading" />;
}

export function EmptyState({ art, title, children, action, className }: { art?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      {art && <div className="mb-4">{art}</div>}
      <h3 className="text-[17px] font-bold">{title}</h3>
      {children && <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-ax-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Sheet / Dialog
function useLockBody(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

/** Bottom sheet on phones, centered dialog from md up. */
export function Sheet({ open, onClose, title, children, footer, dark }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; dark?: boolean }) {
  useLockBody(open);
  useEscape(open, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center md:items-center md:p-6" role="presentation">
      <div className="absolute inset-0 bg-ax-navy/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'animate-sheet relative flex max-h-[88dvh] w-full flex-col rounded-t-[24px] shadow-sheet outline-none md:max-w-lg md:rounded-[24px]',
          dark ? 'bg-ctl-panel text-ctl-text' : 'bg-white',
        )}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ax-border md:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={cx('-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full', dark ? 'hover:bg-ctl-raised' : 'hover:bg-ax-surface')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className={cx('border-t px-5 py-3', dark ? 'border-ctl-line' : 'border-ax-border')}>{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation dialog for consequential actions. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  dark,
  busy,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  dark?: boolean;
  busy?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      dark={dark}
      footer={
        <div className="flex gap-2">
          <Button variant={dark ? 'dark' : 'secondary'} block onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'charge'} block onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className={cx('text-[14px] leading-relaxed', dark ? 'text-ctl-sub' : 'text-ax-muted')}>{body}</div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- misc
export function Segmented<T extends string>({ value, options, onChange, label, dark }: { value: T; options: { value: T; label: ReactNode; icon?: ReactNode }[]; onChange: (v: T) => void; label: string; dark?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-[14px] p-1', dark ? 'bg-ctl-raised' : 'border border-ax-border bg-white')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold transition-colors',
            value === o.value ? (dark ? 'bg-ax-green text-ax-navy' : 'bg-ax-navy text-white') : dark ? 'text-ctl-sub hover:text-white' : 'text-ax-muted hover:text-ax-navy',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, tone, mono = true, wrap, className }: { label: string; value: ReactNode; tone?: 'green' | 'muted'; mono?: boolean; wrap?: boolean; className?: string }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-ax-muted">{label}</span>
      <span className={cx(wrap ? 'text-[15px] font-bold leading-snug' : 'truncate text-[15px] font-bold', mono && 'num', tone === 'green' && 'text-ax-green-text', tone === 'muted' && 'text-ax-muted')}>{value}</span>
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3', className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}
