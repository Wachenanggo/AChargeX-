import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Unlock, Settings2, Square, Download, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { can, CONNECTOR_LABEL, type Charger, type Connector, type ChargingSession, type OcppLogEntry, type CommandResult } from '@achargex/shared';
import { useApi } from '../../lib/hooks';
import { useLive } from '../../lib/live';
import { api } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmDialog, Notice, Sheet, Input } from '../../ui';
import { Panel, PageHead, CtlBadge, CtlButton, Dot, th, td } from '../ui';
import { formatPhp, kwh, kw, timeAgo, dateTime, cx } from '../../lib/format';

interface Detail {
  charger: Charger;
  live: { connected: boolean; version?: string; since?: string; isSimulated?: boolean };
  station: { id: string; name: string; city: string; listingStatus: string };
  connectors: Connector[];
  sessions: ChargingSession[];
  log: OcppLogEntry[];
  commands: CommandResult[];
}

type Pending = { command: string; params?: Record<string, unknown>; title: string; body: string; danger?: boolean } | null;

export default function ChargerDetail() {
  const { identity = '' } = useParams();
  const { user } = useAuth();
  const q = useApi<Detail>(`/api/control/chargers/${encodeURIComponent(identity)}`);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgKey, setCfgKey] = useState('HeartbeatInterval');
  const [cfgVal, setCfgVal] = useState('60');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  useLive(
    (e) => {
      if (e.type === 'log' && e.entry.chargerIdentity === identity) q.setData((d) => d && { ...d, log: [...d.log, e.entry].slice(-200) });
      if (e.type === 'command' && e.command.chargerIdentity === identity)
        q.setData((d) => d && { ...d, commands: d.commands.some((c) => c.id === e.command.id) ? d.commands.map((c) => (c.id === e.command.id ? e.command : c)) : [e.command, ...d.commands] });
      if (e.type === 'connector') q.setData((d) => d && { ...d, connectors: d.connectors.map((c) => (c.id === e.connector.id ? e.connector : c)) });
      if (e.type === 'charger' && e.charger.ocppIdentity === identity) q.setData((d) => d && { ...d, charger: e.charger, live: { ...d.live, connected: e.charger.connected, version: e.charger.ocppVersion } });
      if (e.type === 'session' && e.session.chargerIdentity === identity)
        q.setData((d) => d && { ...d, sessions: d.sessions.some((s) => s.id === e.session.id) ? d.sessions.map((s) => (s.id === e.session.id ? e.session : s)) : [e.session, ...d.sessions] });
    },
    { log: true },
  );

  const d = q.data;
  if (!d) return q.error ? <Notice dark tone="error">{q.error.message}</Notice> : <p className="text-ctl-sub">Loading…</p>;

  const run = async (command: string, params?: Record<string, unknown>) => {
    setErr(undefined);
    setBusy(true);
    try {
      const r = await api<CommandResult>(`/api/control/chargers/${encodeURIComponent(identity)}/commands`, { method: 'POST', body: { command, params } });
      // The SSE result can arrive before this response; never regress a completed status to pending.
      q.setData((x) => {
        if (!x) return x;
        const existing = x.commands.find((c) => c.id === r.id);
        const merged = existing && existing.status !== 'pending' ? existing : r;
        return { ...x, commands: [merged, ...x.commands.filter((c) => c.id !== r.id)] };
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const canCmd = can(user?.role, 'control:remote_commands');
  const canReset = can(user?.role, 'control:reset');
  const canCfg = can(user?.role, 'control:configure');
  const online = d.live.connected;
  const active = d.sessions.filter((s) => ['starting', 'charging', 'stopping'].includes(s.state));
  const lastConfig = d.commands.find((c) => c.command === 'getConfig' && Array.isArray(c.detail));

  return (
    <div className="flex flex-col gap-5">
      <Link to="/control/chargers" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ctl-sub hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Chargers
      </Link>
      <PageHead
        title={d.charger.ocppIdentity}
        sub={
          <>
            {d.station.name} · {d.station.city} · {[d.charger.vendor, d.charger.model].filter(Boolean).join(' ') || 'unknown model'}
            {d.charger.firmware && ` · fw ${d.charger.firmware}`}
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <CtlBadge tone={online ? 'green' : 'red'}>{online ? `online · OCPP ${d.live.version}` : 'offline'}</CtlBadge>
            {d.charger.isSimulated && <CtlBadge tone="amber">simulator — no hardware</CtlBadge>}
            <CtlBadge tone={d.charger.commissioned ? 'green' : 'muted'}>{d.charger.commissioned ? 'commissioned' : 'not commissioned'}</CtlBadge>
          </div>
        }
      />
      {err && <Notice dark tone="error">{err}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Connectors" pad={false}>
            <ul className="divide-y divide-ctl-line">
              {d.connectors.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Dot status={k.status} online={online} />
                  <span className="num w-8 text-[13px] text-ctl-sub">#{k.ocppConnectorId}</span>
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span className="font-semibold text-white">{online ? k.status : 'Offline'}</span>
                    <span className="text-ctl-sub">
                      {' '}
                      · {CONNECTOR_LABEL[k.type]} {k.current} {k.powerKw} kW · {timeAgo(k.statusUpdatedAt)}
                    </span>
                  </span>
                  {canReset && (
                    <CtlButton disabled={!online} onClick={() => setConfirm({ command: 'unlock', params: { connectorId: k.ocppConnectorId }, title: `Unlock connector #${k.ocppConnectorId}?`, body: 'Releases the cable lock. Use only when a driver cannot unplug and no session is active on this connector.', danger: true })}>
                      <Unlock className="h-3.5 w-3.5" /> Unlock
                    </CtlButton>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Remote commands">
            {!online && <p className="mb-3 text-[12px] text-ctl-sub">Charger is offline — commands can't be delivered.</p>}
            <div className="flex flex-wrap gap-2">
              {canReset && (
                <>
                  <CtlButton disabled={!online || busy} onClick={() => setConfirm({ command: 'reset', params: { kind: 'soft' }, title: 'Soft reset charger?', body: 'The charger reboots gracefully and reconnects. Active sessions may be stopped by the charger.' })}>
                    <RotateCcw className="h-3.5 w-3.5" /> Soft reset
                  </CtlButton>
                  <CtlButton tone="danger" disabled={!online || busy} onClick={() => setConfirm({ command: 'reset', params: { kind: 'hard' }, title: 'Hard reset charger?', body: 'Immediate reboot. Any active session will be interrupted. Use only when a soft reset fails.', danger: true })}>
                    <RotateCcw className="h-3.5 w-3.5" /> Hard reset
                  </CtlButton>
                </>
              )}
              {canCmd && (
                <CtlButton disabled={!online || busy} onClick={() => run('getConfig')}>
                  <Download className="h-3.5 w-3.5" /> Get configuration
                </CtlButton>
              )}
              {canCfg && (
                <CtlButton disabled={!online || busy} onClick={() => setCfgOpen(true)}>
                  <Settings2 className="h-3.5 w-3.5" /> Change configuration
                </CtlButton>
              )}
            </div>
            {!canReset && <p className="mt-3 text-[12px] text-ctl-sub">Your role can view this charger. Reset, unlock and configuration need an administrator.</p>}

            <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[1.2px] text-ctl-sub">Command history</h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {d.commands.slice(0, 8).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-ctl-bg px-3 py-2 text-[12px]">
                  <span className="num font-semibold text-white">{c.command}</span>
                  <CtlBadge tone={c.status === 'Accepted' ? 'green' : c.status === 'pending' ? 'blue' : 'red'}>
                    {c.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />} {c.status}
                  </CtlBadge>
                  <span className="text-ctl-sub">{timeAgo(c.issuedAt)}</span>
                  {c.status === 'pending' && <span className="text-ctl-sub">· awaiting charger CALLRESULT</span>}
                </li>
              ))}
              {d.commands.length === 0 && <li className="text-[12px] text-ctl-sub">No commands sent yet.</li>}
            </ul>
          </Panel>

          {lastConfig && (
            <Panel title="Configuration (from charger)" pad={false}>
              <table className="w-full text-[12px]">
                <tbody className="divide-y divide-ctl-line">
                  {(lastConfig.detail as { key: string; value?: string; readonly: boolean }[]).map((k) => (
                    <tr key={k.key}>
                      <td className={cx(td, 'num text-ctl-sub')}>{k.key}</td>
                      <td className={cx(td, 'num text-white')}>{k.value ?? '—'}</td>
                      <td className={td}>{k.readonly && <CtlBadge>read-only</CtlBadge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel title={`Sessions · ${active.length} active`} pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead>
                  <tr className="border-b border-ctl-line">
                    <th className={th}>Created</th>
                    <th className={th}>State</th>
                    <th className={cx(th, 'text-right')}>Energy</th>
                    <th className={cx(th, 'text-right')}>Cost</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ctl-line">
                  {d.sessions.map((s) => (
                    <tr key={s.id}>
                      <td className={td}>{dateTime(s.createdAt)}</td>
                      <td className={td}>
                        <CtlBadge tone={s.state === 'charging' ? 'green' : s.state === 'failed' ? 'red' : 'muted'}>{s.state}</CtlBadge>
                      </td>
                      <td className={cx(td, 'num text-right')}>
                        {kwh(s.energyWh)} kWh {s.state === 'charging' && <span className="text-ctl-sub">@ {kw(s.powerW)} kW</span>}
                      </td>
                      <td className={cx(td, 'num text-right')}>{formatPhp(s.costPhp)}</td>
                      <td className={cx(td, 'text-right')}>
                        {s.state === 'charging' && canCmd && (
                          <CtlButton tone="danger" onClick={() => setConfirm({ command: 'stopSession', params: { sessionId: s.id }, title: 'Remote stop this session?', body: 'Sends a remote stop to the charger. The driver is billed for energy delivered so far.', danger: true })}>
                            <Square className="h-3 w-3" /> Stop
                          </CtlButton>
                        )}
                      </td>
                    </tr>
                  ))}
                  {d.sessions.length === 0 && (
                    <tr>
                      <td className={cx(td, 'text-ctl-sub')} colSpan={5}>
                        No sessions on this charger yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel title="OCPP message log · live" pad={false} className="xl:sticky xl:top-6 xl:self-start">
          <ol className="max-h-[70dvh] overflow-y-auto font-mono text-[11px] leading-relaxed" aria-live="off">
            {[...d.log].reverse().map((l) => (
              <li key={l.id} className="flex gap-2 border-b border-ctl-line/60 px-3 py-1.5">
                {l.direction === 'in' ? <ArrowDownLeft className="mt-0.5 h-3 w-3 shrink-0 text-ax-green" aria-label="from charger" /> : <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-[#8FB3FF]" aria-label="to charger" />}
                <span className="shrink-0 text-ctl-sub">{new Date(l.at).toLocaleTimeString('en-PH', { hour12: false })}</span>
                <span className="min-w-0 break-all text-ctl-text">{l.frame}</span>
              </li>
            ))}
            {d.log.length === 0 && <li className="p-3 text-ctl-sub">No frames yet.</li>}
          </ol>
        </Panel>
      </div>

      <ConfirmDialog dark open={!!confirm} title={confirm?.title ?? ''} body={confirm?.body ?? ''} confirmLabel="Send to charger" danger={confirm?.danger} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => confirm && run(confirm.command, confirm.params)} />
      <Sheet dark open={cfgOpen} onClose={() => setCfgOpen(false)} title="Change configuration">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ctl-sub">Sent as ChangeConfiguration (1.6) or SetVariables (2.0.1). The charger decides whether to accept.</p>
          <div className="text-ax-navy">
            <Input label="Key" value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} className="[&_label]:text-ctl-text" />
          </div>
          <div className="text-ax-navy">
            <Input label="Value" value={cfgVal} onChange={(e) => setCfgVal(e.target.value)} className="[&_label]:text-ctl-text" />
          </div>
          <CtlButton
            tone="primary"
            className="h-11"
            disabled={!cfgKey || busy}
            onClick={() => {
              setCfgOpen(false);
              setConfirm({ command: 'setConfig', params: { key: cfgKey, value: cfgVal }, title: `Set ${cfgKey} = ${cfgVal}?`, body: 'Configuration changes affect how the charger behaves. Some keys require a reboot.' });
            }}
          >
            Review change
          </CtlButton>
        </div>
      </Sheet>
    </div>
  );
}
