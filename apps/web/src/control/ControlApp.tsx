import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { Gauge, PlugZap, Activity, ClipboardCheck, Bell, ScrollText, Receipt, ShieldCheck, ArrowLeftRight } from 'lucide-react';
import { can, ROLE_LABEL, type Permission } from '@achargex/shared';
import { Logo, DemoBadge } from '../ui';
import { useAuth } from '../auth/AuthProvider';
import { cx } from '../lib/format';
import Overview from './pages/Overview';
import Chargers from './pages/Chargers';
import ChargerDetail from './pages/ChargerDetail';
import { ControlSessions, Approvals, Alerts, Audit, Payments, Access } from './pages/Ops';

const NAV: { to: string; label: string; icon: typeof Gauge; perm: Permission; end?: boolean }[] = [
  { to: '/control', label: 'Overview', icon: Gauge, perm: 'control:view', end: true },
  { to: '/control/chargers', label: 'Chargers', icon: PlugZap, perm: 'control:view' },
  { to: '/control/sessions', label: 'Sessions', icon: Activity, perm: 'control:view' },
  { to: '/control/approvals', label: 'Approvals', icon: ClipboardCheck, perm: 'admin:approve_stations' },
  { to: '/control/alerts', label: 'Alerts', icon: Bell, perm: 'control:view' },
  { to: '/control/payments', label: 'Payments', icon: Receipt, perm: 'admin:audit' },
  { to: '/control/audit', label: 'Audit log', icon: ScrollText, perm: 'admin:audit' },
  { to: '/control/access', label: 'Access', icon: ShieldCheck, perm: 'control:view' },
];

export default function ControlApp() {
  const { user } = useAuth();
  const nav = NAV.filter((n) => can(user?.role, n.perm));
  return (
    <div className="flex min-h-dvh bg-ctl-bg text-ctl-text" style={{ colorScheme: 'dark' }}>
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-ctl-line bg-ctl-panel px-3 py-5 lg:flex">
        <Link to="/control" className="px-2">
          <Logo dark size={18} />
        </Link>
        <p className="mt-1 px-2 text-[11px] font-bold uppercase tracking-[1.5px] text-ax-green">Control · CSMS</p>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Control">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-semibold', isActive ? 'bg-ctl-raised text-white' : 'text-ctl-sub hover:bg-ctl-raised hover:text-white')}
            >
              <n.icon className="h-[18px] w-[18px]" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <Link to="/" className="flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-semibold text-ctl-sub hover:bg-ctl-raised hover:text-white">
            <ArrowLeftRight className="h-[18px] w-[18px]" /> AChargeX Go
          </Link>
          <p className="flex items-center gap-2 px-3 text-[12px] text-ctl-sub">
            {user && ROLE_LABEL[user.role]} {user?.isDemo && <DemoBadge dark />}
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-[700] border-b border-ctl-line bg-ctl-panel/95 backdrop-blur lg:hidden" style={{ paddingTop: 'var(--safe-top)' }}>
          <div className="flex h-14 items-center justify-between px-4">
            <span className="flex items-center gap-2">
              <Logo dark size={17} />
              <span className="rounded-md bg-ax-green/15 px-1.5 py-0.5 text-[10px] font-bold tracking-[1.2px] text-ax-green">CONTROL</span>
            </span>
            <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ctl-sub hover:bg-ctl-raised">
              <ArrowLeftRight className="h-4 w-4" /> Go
            </Link>
          </div>
          <nav className="scroll-x gap-1 px-3 pb-2" aria-label="Control">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold', isActive ? 'bg-ax-green text-ax-navy' : 'text-ctl-sub hover:text-white')}
              >
                <n.icon className="h-4 w-4" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-5 md:px-6 lg:pt-7" style={{ paddingBottom: 'calc(40px + var(--safe-bottom))' }}>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="chargers" element={<Chargers />} />
            <Route path="chargers/:identity" element={<ChargerDetail />} />
            <Route path="sessions" element={<ControlSessions />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="payments" element={<Payments />} />
            <Route path="audit" element={<Audit />} />
            <Route path="access" element={<Access />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
