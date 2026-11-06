import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { LISTING_LABEL, type ListingStatus } from '@achargex/shared';
import { cx } from '../lib/format';

const LISTING_STYLE: Record<ListingStatus, string> = {
  draft: 'bg-ax-surface text-ax-muted',
  pending: 'bg-ax-deal-bg text-ax-deal-text',
  approved: 'bg-ax-mint text-ax-green-text',
  rejected: 'bg-ax-busy-bg text-ax-busy',
  suspended: 'bg-ax-busy-bg text-ax-busy',
};

export function ListingBadge({ status, className }: { status: ListingStatus; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.1px]', LISTING_STYLE[status], className)}>{LISTING_LABEL[status]}</span>;
}

export function CopyField({ label, value, mono = true, secret, dark }: { label: string; value: string; mono?: boolean; secret?: boolean; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(!secret);
  return (
    <div className="flex flex-col gap-1">
      <span className={cx('text-[11px] font-semibold uppercase tracking-[1.2px]', dark ? 'text-ctl-sub' : 'text-ax-muted')}>{label}</span>
      <div className={cx('flex items-center gap-2 rounded-[12px] border px-3 py-2', dark ? 'border-ctl-line bg-ctl-bg' : 'border-ax-border bg-ax-bg')}>
        <code className={cx('min-w-0 flex-1 break-all text-[13px]', mono && 'font-mono')}>{show ? value : '•'.repeat(Math.min(24, value.length))}</code>
        {secret && (
          <button type="button" className="text-[12px] font-semibold text-ax-green-text" onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'Show'}
          </button>
        )}
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className={cx('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', dark ? 'hover:bg-ctl-raised' : 'hover:bg-white')}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          {copied ? <Check className="h-4 w-4 text-ax-green" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export interface ConnectionCard {
  identity: string;
  url: string;
  password?: string;
  supportedVersions: string[];
  security: string;
}
