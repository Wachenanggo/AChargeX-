import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { LayoutDashboard, Building2, PlusCircle, History, ArrowLeftRight } from 'lucide-react';
import { Logo, DemoBadge } from '../ui';
import { useAuth } from '../auth/AuthProvider';
import { cx } from '../lib/format';
import NetworkDashboard from './pages/Dashboard';
import StationsList from './pages/StationsList';
import StationForm from './pages/StationForm';
import StationManage from './pages/StationManage';
import NetworkSessions from './pages/NetworkSessions';

const NAV = [
  { to: '/network', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/network/stations', label: 'Stations', icon: Building2 },
  { to: '/network/stations/new', label: 'Add station', icon: PlusCircle },
  { to: '/network/sessions', label: 'Sessions', icon: History },
];

export default function NetworkApp() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-dvh bg-ax-bg">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-ax-border bg-white px-4 py-6 lg:flex">
        <Link to="/network" className="px-2">
          <Logo />
        </Link>
        <p className="mt-1 px-2 text-[12px] font-bold uppercase tracking-[1.4px] text-ax-green-text">Network · Owners</p>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Network">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end || n.to === '/network/stations'}
              className={({ isActive }) => cx('flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-semibold', isActive ? 'bg-ax-mint text-ax-navy' : 'text-ax-muted hover:bg-ax-surface hover:text-ax-navy')}
            >
              <n.icon className="h-5 w-5" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="mt-auto flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-semibold text-ax-muted hover:bg-ax-surface">
          <ArrowLeftRight className="h-5 w-5" /> Back to AChargeX Go
        </Link>
        <p className="mt-2 flex items-center gap-2 px-3 text-[12px] text-ax-muted">
          {user?.name} {user?.isDemo && <DemoBadge />}
        </p>
      </aside>

      <div className="min-w-0 flex-1">
        {/* mobile header */}
        <header className="sticky top-0 z-[700] border-b border-ax-border bg-white/95 backdrop-blur lg:hidden" style={{ paddingTop: 'var(--safe-top)' }}>
          <div className="flex h-14 items-center justify-between px-4">
            <span className="flex items-center gap-2">
              <Logo size={18} />
              <span className="rounded-md bg-ax-mint px-1.5 py-0.5 text-[10px] font-bold tracking-[1.2px] text-ax-green-text">NETWORK</span>
            </span>
            <Link to="/" className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ax-muted hover:bg-ax-surface">
              <ArrowLeftRight className="h-4 w-4" /> Go app
            </Link>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1100px] px-4 pb-[calc(88px+var(--safe-bottom))] pt-5 md:px-6 lg:pb-10 lg:pt-8">
          <Routes>
            <Route index element={<NetworkDashboard />} />
            <Route path="stations" element={<StationsList />} />
            <Route path="stations/new" element={<StationForm />} />
            <Route path="stations/:id" element={<StationManage />} />
            <Route path="sessions" element={<NetworkSessions />} />
          </Routes>
        </main>

        {/* mobile tabs */}
        <nav aria-label="Network" className="fixed inset-x-0 bottom-0 z-[700] border-t border-ax-border bg-white lg:hidden" style={{ paddingBottom: 'var(--safe-bottom)' }}>
          <ul className="grid h-[68px] grid-cols-4">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end || n.to === '/network/stations'}
                  className={({ isActive }) => cx('flex h-full flex-col items-center justify-center gap-1 text-[11px]', isActive ? 'font-bold text-ax-navy' : 'font-semibold text-ax-muted')}
                >
                  <n.icon className="h-[22px] w-[22px]" aria-hidden />
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
