import { Link } from 'react-router-dom';
import { ShieldCheck, Receipt, ChevronRight } from 'lucide-react';
import { can, type PaymentTransaction, type PaymentState } from '@achargex/shared';
import { Card, DemoBadge, EmptyState, ButtonLink, Notice, SectionTitle, StatusBadge, Skeleton } from '../../ui';
import { EmptyArt } from '../../assets/illustrations';
import { useApi } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { useAuth } from '../../auth/AuthProvider';
import { useGo } from '../data';
import { Page } from '../GoLayout';
import { dateTime, formatPhp } from '../../lib/format';

const STATE: Record<PaymentState, { label: string; tone: 'available' | 'busy' | 'offline' | 'reserved' | 'fault' }> = {
  created: { label: 'Created', tone: 'offline' },
  pending: { label: 'Pending', tone: 'reserved' },
  authorized: { label: 'Hold active', tone: 'reserved' },
  captured: { label: 'Paid', tone: 'available' },
  partially_refunded: { label: 'Part refunded', tone: 'reserved' },
  refunded: { label: 'Refunded', tone: 'offline' },
  voided: { label: 'Hold released', tone: 'offline' },
  failed: { label: 'Failed', tone: 'fault' },
};

export default function Wallet() {
  const { user } = useAuth();
  const { config, offline } = useGo();
  const allowed = !!user && can(user.role, 'payments:own') && !offline;
  const q = useApi<PaymentTransaction[]>(allowed ? '/api/payments' : null, [user?.id]);
  useLive((e) => {
    if (e.type === 'payment' && e.payment.userId === user?.id) q.setData((l) => (l?.some((p) => p.id === e.payment.id) ? l.map((p) => (p.id === e.payment.id ? e.payment : p)) : [e.payment, ...(l ?? [])]));
  });
  const providers = config?.paymentProviders ?? [];

  if (!allowed) {
    return (
      <Page>
        <h1 className="pt-6 text-[26px] font-extrabold tracking-[-0.6px] lg:pt-8">Wallet</h1>
        <EmptyState art={<EmptyArt kind="payments" />} title={offline ? 'Unavailable offline' : 'Sign in to manage payments'} action={!offline && <ButtonLink to="/signin?next=/wallet">Sign in</ButtonLink>} />
      </Page>
    );
  }

  return (
    <Page wide>
      <h1 className="pt-6 text-[26px] font-extrabold tracking-[-0.6px] lg:pt-8">Wallet</h1>
      <p className="mt-1 text-[14px] text-ax-muted">Payment methods, holds and receipts.</p>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-8">
        <section className="mt-5">
          <SectionTitle>Payment methods</SectionTitle>
          <div className="mt-3 flex flex-col gap-2">
            {providers.map((p) => (
              <Card key={p.id} className="flex items-center gap-3 p-3.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-ax-navy text-[12px] font-bold text-white">{p.short}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[15px] font-semibold">
                    {p.name} {p.isDemo && <DemoBadge />}
                  </span>
                  <span className="text-[12px] text-ax-muted">{p.isDemo ? 'Simulated holds for demo chargers only' : 'Provider checkout'}</span>
                </span>
              </Card>
            ))}
            <Notice tone="info" title="GCash, Maya and cards">
              Real payment methods appear once the operator connects a payment provider. Card numbers are never stored by AChargeX — only provider tokens.
            </Notice>
          </div>
          <div className="mt-4 flex items-start gap-2.5 rounded-[16px] bg-ax-surface p-3.5 text-[13px] text-ax-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ax-green-text" aria-hidden />
            Holds are placed before charging and only the metered amount is captured. The rest is released automatically.
          </div>
        </section>

        <section className="mt-7 lg:mt-5">
          <SectionTitle>Transactions</SectionTitle>
          {q.loading ? (
            <Skeleton className="mt-3 h-40" />
          ) : !q.data?.length ? (
            <EmptyState art={<EmptyArt kind="payments" />} title="No transactions yet">
              Holds and payments from your sessions will show here.
            </EmptyState>
          ) : (
            <Card className="mt-3 divide-y divide-ax-border">
              {q.data.map((p) => (
                <Link key={p.id} to={p.sessionId ? `/session/${p.sessionId}` : '#'} className="flex items-center gap-3 p-4 hover:bg-ax-bg">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-ax-surface">
                    <Receipt className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{p.provider === 'demo' ? 'Demo wallet' : p.provider.toUpperCase()}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ax-muted">
                      <StatusBadge tone={STATE[p.state].tone} label={STATE[p.state].label} />
                      {dateTime(p.createdAt)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="num text-[15px] font-bold">{formatPhp(p.capturedAmount ?? p.holdAmount)}</span>
                    <span className="text-[11px] text-ax-muted">{p.capturedAmount !== undefined ? `of ${formatPhp(p.holdAmount)} hold` : 'hold'}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-ax-muted" aria-hidden />
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>
    </Page>
  );
}
