import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, BadgeCheck } from 'lucide-react';
import { ALL_ROLES, ROLE_LABEL, can, CONNECTOR_LABEL, type Alert, type AuditLog, type ChargingSession, type PaymentTransaction, type StationWithDetail, type Permission } from '@achargex/shared';
import { useApi } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { api } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmDialog, Notice, Segmented } from '../../ui';
import { Panel, PageHead, CtlBadge, CtlButton, th, td } from '../ui';
import { dateTime, formatPhp, kwh, timeAgo, cx } from '../../lib/format';

// ---------------------------------------------------------------- Sessions
export function ControlSessions() {
  const q = useApi<ChargingSession[]>('/api/control/sessions');
  const [f, setF] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  useLive((e) => {
    if (e.type === 'session') q.setData((l) => (l?.some((s) => s.id === e.session.id) ? l.map((s) => (s.id === e.session.id ? e.session : s)) : [e.session, ...(l ?? [])]));
  });
  const rows = (q.data ?? []).filter((s) =>
    f === 'all' ? true : f === 'active' ? ['starting', 'charging', 'stopping'].includes(s.state) : f === 'completed' ? s.state === 'completed' : ['failed', 'cancelled'].includes(s.state),
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Sessions" sub="All charging sessions across the network" action={<Segmented dark label="Filter" value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Done' }, { value: 'failed', label: 'Failed' }]} />} />
      <Panel pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-ctl-line">
                <th className={th}>Created</th>
                <th className={th}>Charger</th>
                <th className={th}>Tx ID</th>
                <th className={th}>State</th>
                <th className={cx(th, 'text-right')}>Energy</th>
                <th className={cx(th, 'text-right')}>Cost</th>
                <th className={cx(th, 'text-right')}>Limit</th>
                <th className={th}>Stop reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ctl-line">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-ctl-raised/50">
                  <td className={td}>{dateTime(s.createdAt)}</td>
                  <td className={td}>
                    <Link to={`/control/chargers/${s.chargerIdentity}`} className="num hover:text-ax-green">
                      {s.chargerIdentity}
                    </Link>
                  </td>
                  <td className={cx(td, 'num text-ctl-sub')}>{s.ocppTransactionId ?? '—'}</td>
                  <td className={td}>
                    <CtlBadge tone={s.state === 'charging' ? 'green' : s.state === 'failed' ? 'red' : s.state === 'completed' ? 'muted' : 'blue'}>{s.state}</CtlBadge> {s.isSimulated && <CtlBadge tone="amber">SIM</CtlBadge>}
                  </td>
                  <td className={cx(td, 'num text-right')}>{kwh(s.energyWh)}</td>
                  <td className={cx(td, 'num text-right')}>{formatPhp(s.costPhp)}</td>
                  <td className={cx(td, 'num text-right text-ctl-sub')}>{formatPhp(s.limitPhp)}</td>
                  <td className={cx(td, 'text-ctl-sub')}>{s.error ?? s.stopReason ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className={cx(td, 'text-ctl-sub')}>
                    {q.loading ? 'Loading…' : 'No sessions.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Approvals
export function Approvals() {
  const q = useApi<StationWithDetail[]>('/api/stations?scope=all');
  const { user } = useAuth();
  const [err, setErr] = useState<string>();
  const [act, setAct] = useState<{ s: StationWithDetail; to: 'approved' | 'rejected' | 'suspended' } | null>(null);
  const [busy, setBusy] = useState(false);
  useLive((e) => {
    if (e.type === 'station') q.setData((l) => l?.map((s) => (s.id === e.station.id ? e.station : s)));
    if (e.type === 'charger') q.setData((l) => l?.map((s) => (s.id === e.stationId ? { ...s, chargers: s.chargers.map((c) => (c.id === e.charger.id ? { ...c, ...e.charger } : c)) } : s)));
  });
  if (!can(user?.role, 'admin:approve_stations')) return <Notice dark>Administrator access required.</Notice>;
  const pending = (q.data ?? []).filter((s) => s.listingStatus === 'pending');
  const approved = (q.data ?? []).filter((s) => s.listingStatus === 'approved');
  const needsCommission = approved.flatMap((s) => s.chargers.filter((c) => !c.commissioned).map((c) => ({ s, c })));

  const transition = async () => {
    if (!act) return;
    setBusy(true);
    setErr(undefined);
    try {
      await api(`/api/stations/${act.s.id}/status`, { method: 'POST', body: { to: act.to } });
      q.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setAct(null);
    }
  };
  const commission = async (sid: string, cid: string) => {
    setErr(undefined);
    try {
      await api(`/api/stations/${sid}/chargers/${cid}/commission`, { method: 'POST' });
      q.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Approvals & commissioning" sub="Review station listings and enable verified chargers for live charging" />
      {err && <Notice dark tone="error">{err}</Notice>}
      <Panel title={`Pending review · ${pending.length}`} pad={false}>
        <ul className="divide-y divide-ctl-line">
          {pending.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{s.name}</p>
                <p className="text-[12px] text-ctl-sub">
                  {s.address}, {s.city} · {s.lat.toFixed(4)}, {s.lng.toFixed(4)} · {s.access}
                </p>
                <p className="mt-1 text-[12px] text-ctl-sub">
                  {s.chargers.length} charger(s): {s.connectors.map((k) => `${CONNECTOR_LABEL[k.type]} ${k.powerKw}kW`).join(', ')} · ₱{s.tariffs.map((t) => t.pricePerKwh).join(' / ₱')}/kWh
                </p>
              </div>
              <div className="flex gap-2">
                <CtlButton tone="danger" onClick={() => setAct({ s, to: 'rejected' })}>
                  <X className="h-3.5 w-3.5" /> Reject
                </CtlButton>
                <CtlButton tone="primary" onClick={() => setAct({ s, to: 'approved' })}>
                  <Check className="h-3.5 w-3.5" /> Approve listing
                </CtlButton>
              </div>
            </li>
          ))}
          {pending.length === 0 && <li className="p-4 text-[13px] text-ctl-sub">Nothing waiting for review.</li>}
        </ul>
      </Panel>

      <Panel title={`Awaiting commissioning · ${needsCommission.length}`} pad={false}>
        <ul className="divide-y divide-ctl-line">
          {needsCommission.map(({ s, c }) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="num font-semibold text-white">{c.ocppIdentity}</p>
                <p className="text-[12px] text-ctl-sub">
                  {s.name} · {c.connected ? `connected · OCPP ${c.ocppVersion}` : 'not connected yet'}
                </p>
              </div>
              <CtlButton tone="primary" disabled={!c.connected} onClick={() => commission(s.id, c.id)} title={c.connected ? '' : 'The charger must connect (BootNotification) first'}>
                <BadgeCheck className="h-3.5 w-3.5" /> Commission
              </CtlButton>
            </li>
          ))}
          {needsCommission.length === 0 && <li className="p-4 text-[13px] text-ctl-sub">All approved chargers are commissioned.</li>}
        </ul>
      </Panel>

      <Panel title={`Approved stations · ${approved.length}`} pad={false}>
        <ul className="divide-y divide-ctl-line">
          {approved.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-white">{s.name}</span> <span className="text-ctl-sub">· {s.city}</span> {s.isDemo && <CtlBadge tone="amber">demo</CtlBadge>}
              </span>
              <CtlButton tone="danger" onClick={() => setAct({ s, to: 'suspended' })}>
                Suspend
              </CtlButton>
            </li>
          ))}
        </ul>
      </Panel>

      <ConfirmDialog
        dark
        open={!!act}
        busy={busy}
        title={act ? `${act.to === 'approved' ? 'Approve' : act.to === 'rejected' ? 'Reject' : 'Suspend'} ${act.s.name}?` : ''}
        body={
          act?.to === 'approved'
            ? 'The listing becomes visible to drivers. Live charging still requires each charger to be connected and commissioned.'
            : act?.to === 'suspended'
              ? 'The station is hidden from drivers and its chargers are decommissioned until reinstated.'
              : 'The owner can edit and resubmit.'
        }
        confirmLabel={act?.to === 'approved' ? 'Approve' : act?.to === 'rejected' ? 'Reject' : 'Suspend'}
        danger={act?.to !== 'approved'}
        onCancel={() => setAct(null)}
        onConfirm={transition}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Alerts
export function Alerts() {
  const q = useApi<Alert[]>('/api/control/alerts');
  const [showAck, setShowAck] = useState(false);
  useLive((e) => {
    if (e.type === 'alert') q.setData((l) => [e.alert, ...(l ?? [])]);
  });
  const rows = (q.data ?? []).filter((a) => showAck || !a.acknowledged);
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Alerts" action={<Segmented dark label="Show" value={showAck ? 'all' : 'open'} onChange={(v) => setShowAck(v === 'all')} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />} />
      <Panel pad={false}>
        <ul className="divide-y divide-ctl-line">
          {rows.map((a) => (
            <li key={a.id} className={cx('flex flex-wrap items-start gap-3 px-4 py-3', a.acknowledged && 'opacity-60')}>
              <CtlBadge tone={a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'amber' : 'muted'}>{a.severity}</CtlBadge>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-white">{a.message}</p>
                <p className="text-[11px] text-ctl-sub">
                  {a.chargerIdentity && (
                    <Link to={`/control/chargers/${a.chargerIdentity}`} className="num hover:text-ax-green">
                      {a.chargerIdentity}
                    </Link>
                  )}{' '}
                  · {timeAgo(a.at)}
                </p>
              </div>
              {!a.acknowledged && (
                <CtlButton
                  onClick={async () => {
                    await api(`/api/control/alerts/${a.id}/ack`, { method: 'POST' });
                    q.setData((l) => l?.map((x) => (x.id === a.id ? { ...x, acknowledged: true } : x)));
                  }}
                >
                  Acknowledge
                </CtlButton>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="p-4 text-[13px] text-ctl-sub">No alerts.</li>}
        </ul>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Payments
export function Payments() {
  const q = useApi<PaymentTransaction[]>('/api/control/payments');
  useLive((e) => {
    if (e.type === 'payment') q.setData((l) => (l?.some((p) => p.id === e.payment.id) ? l.map((p) => (p.id === e.payment.id ? e.payment : p)) : [e.payment, ...(l ?? [])]));
  });
  const rows = q.data ?? [];
  const captured = rows.filter((p) => p.state === 'captured').reduce((a, p) => a + (p.capturedAmount ?? 0), 0);
  const held = rows.filter((p) => p.state === 'authorized').reduce((a, p) => a + p.holdAmount, 0);
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Payments & reconciliation" sub="Holds, captures and releases. Real provider settlement appears once a provider is connected." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[14px] border border-ctl-line bg-ctl-panel px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-ctl-sub">Captured</p>
          <p className="num mt-1 text-[20px] font-bold text-white">{formatPhp(captured)}</p>
        </div>
        <div className="rounded-[14px] border border-ctl-line bg-ctl-panel px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-ctl-sub">Active holds</p>
          <p className="num mt-1 text-[20px] font-bold text-white">{formatPhp(held)}</p>
        </div>
      </div>
      {rows.some((p) => p.isDemo) && <Notice dark>All transactions shown are DEMO — no money moved.</Notice>}
      <Panel pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-ctl-line">
                <th className={th}>Created</th>
                <th className={th}>Provider</th>
                <th className={th}>State</th>
                <th className={cx(th, 'text-right')}>Hold</th>
                <th className={cx(th, 'text-right')}>Captured</th>
                <th className={th}>Idempotency key</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ctl-line">
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{dateTime(p.createdAt)}</td>
                  <td className={td}>
                    {p.provider} {p.isDemo && <CtlBadge tone="amber">demo</CtlBadge>}
                  </td>
                  <td className={td}>
                    <CtlBadge tone={p.state === 'captured' ? 'green' : p.state === 'failed' ? 'red' : p.state === 'authorized' ? 'blue' : 'muted'}>{p.state}</CtlBadge>
                  </td>
                  <td className={cx(td, 'num text-right')}>{formatPhp(p.holdAmount)}</td>
                  <td className={cx(td, 'num text-right')}>{p.capturedAmount !== undefined ? formatPhp(p.capturedAmount) : '—'}</td>
                  <td className={cx(td, 'num truncate text-[11px] text-ctl-sub')}>{p.idempotencyKey}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className={cx(td, 'text-ctl-sub')}>
                    No transactions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Audit
export function Audit() {
  const q = useApi<AuditLog[]>('/api/control/audit');
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Audit log" sub="Every privileged action, with actor and role" action={<CtlButton onClick={q.reload}>Refresh</CtlButton>} />
      <Panel pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-ctl-line">
                <th className={th}>Time</th>
                <th className={th}>Actor</th>
                <th className={th}>Action</th>
                <th className={th}>Target</th>
                <th className={th}>Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ctl-line">
              {(q.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td className={cx(td, 'whitespace-nowrap')}>{dateTime(a.at)}</td>
                  <td className={td}>
                    <span className="num text-[12px]">{a.actorId}</span> <CtlBadge>{a.actorRole}</CtlBadge>
                  </td>
                  <td className={cx(td, 'num text-ax-green')}>{a.action}</td>
                  <td className={cx(td, 'num text-[12px]')}>{a.target}</td>
                  <td className={cx(td, 'max-w-[280px] truncate text-ctl-sub')}>{a.detail ?? ''}</td>
                </tr>
              ))}
              {!q.data?.length && (
                <tr>
                  <td colSpan={5} className={cx(td, 'text-ctl-sub')}>
                    No audited actions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Access
const PERMS: { p: Permission; label: string }[] = [
  { p: 'stations:browse', label: 'Browse stations' },
  { p: 'sessions:start', label: 'Start charging' },
  { p: 'network:manage_own_stations', label: 'Manage own stations' },
  { p: 'control:view', label: 'View CSMS' },
  { p: 'control:remote_commands', label: 'Remote start/stop, get config' },
  { p: 'control:reset', label: 'Reset / unlock' },
  { p: 'control:configure', label: 'Change configuration' },
  { p: 'admin:approve_stations', label: 'Approve & commission' },
  { p: 'admin:audit', label: 'Audit & payments' },
  { p: 'admin:super', label: 'Super admin' },
];

export function Access() {
  const { mode } = useAuth();
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Access control" sub="Role permissions enforced by the OCPP service and Supabase row-level security" />
      <Panel pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12px]">
            <thead>
              <tr className="border-b border-ctl-line">
                <th className={th}>Permission</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className={cx(th, 'text-center')}>
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ctl-line">
              {PERMS.map(({ p, label }) => (
                <tr key={p}>
                  <td className={td}>
                    <span className="text-white">{label}</span> <span className="num text-[10px] text-ctl-sub">{p}</span>
                  </td>
                  {ALL_ROLES.map((r) => (
                    <td key={r} className={cx(td, 'text-center')}>
                      {can(r, p) ? <Check className="mx-auto h-4 w-4 text-ax-green" aria-label="allowed" /> : <span className="text-ctl-line" aria-label="denied">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Notice dark title="Assigning roles">
        {mode === 'demo'
          ? 'Demo mode: switch roles from Account → Demo mode in AChargeX Go.'
          : 'Roles live in auth.users.app_metadata.role and the profiles table. Only a super administrator can change them, using the set_user_role() SQL function (see supabase/migrations). Every change is written to the audit log.'}
      </Notice>
    </div>
  );
}
