import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Home, MapPin, ScanLine, Car, Wallet, History, Building2, Gauge, UserRound } from 'lucide-react';
import { can, ROLE_LABEL } from '@achargex/shared';
import { Logo, DemoBadge } from '../ui';
import { useAuth } from '../auth/AuthProvider';
import { cx } from '../lib/format';
import { GoDataProvider } from './data';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/find', label: 'Find', icon: MapPin },
  { to: '/scan', label: 'Scan', icon: ScanLine, fab: true },
  { to: '/garage', label: 'Garage', icon: Car },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
];

function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[900] border-t border-ax-border bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto grid h-[72px] max-w-[640px] grid-cols-5 items-start pt-2">
        {NAV.map((n) => (
          <li key={n.to} className="flex justify-center">
            <NavLink
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex min-w-[56px] flex-col items-center gap-1 text-[11px]',
                  n.fab ? '-mt-7 font-bold text-ax-navy' : isActive ? 'font-bold text-ax-navy' : 'font-semibold text-ax-muted',
                )
              }
            >
              {({ isActive }) =>
                n.fab ? (
                  <>
                    <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full border-4 border-white bg-ax-green shadow-fab">
                      <n.icon className="h-6 w-6 text-ax-navy" strokeWidth={2.2} aria-hidden />
                    </span>
                    {n.label}
                  </>
                ) : (
                  <>
                    <span className={cx('flex h-8 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-ax-mint')}>
                      <n.icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.3 : 2} aria-hidden />
                    </span>
                    {n.label}
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Sidebar() {
  const { user } = useAuth();
  const items = [...NAV.slice(0, 2), { to: '/sessions', label: 'Sessions', icon: History }, ...NAV.slice(2)];
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-ax-border bg-white px-4 py-6 lg:flex">
      <Link to="/" className="px-2">
        <Logo />
      </Link>
      <p className="mt-1 px-2 text-[12px] font-medium text-ax-muted">Find. Charge. Manage.</p>
      <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={'end' in n ? n.end : undefined}
            className={({ isActive }) =>
              cx('flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-semibold transition-colors', isActive ? 'bg-ax-mint text-ax-navy' : 'text-ax-muted hover:bg-ax-surface hover:text-ax-navy')
            }
          >
            <n.icon className="h-5 w-5" aria-hidden />
            {n.label === 'Scan' ? 'Scan QR' : n.label}
          </NavLink>
        ))}
      </nav>
      {user && (can(user.role, 'network:manage_own_stations') || can(user.role, 'control:view')) && (
        <div className="mt-8">
          <p className="eyebrow px-3">Workspaces</p>
          <div className="mt-2 flex flex-col gap-1">
            {can(user.role, 'network:manage_own_stations') && (
              <Link to="/network" className="flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-semibold text-ax-muted hover:bg-ax-surface hover:text-ax-navy">
                <Building2 className="h-5 w-5" aria-hidden /> AChargeX Network
              </Link>
            )}
            {can(user.role, 'control:view') && (
              <Link to="/control" className="flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-semibold text-ax-muted hover:bg-ax-surface hover:text-ax-navy">
                <Gauge className="h-5 w-5" aria-hidden /> AChargeX Control
              </Link>
            )}
          </div>
        </div>
      )}
      <Link to="/account" className="mt-auto flex items-center gap-3 rounded-[14px] border border-ax-border p-3 hover:bg-ax-surface">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ax-navy text-white">
          <UserRound className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{user?.name ?? 'Sign in'}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-ax-muted">
            {user ? ROLE_LABEL[user.role] : 'Guest browsing'}
            {user?.isDemo && <DemoBadge />}
          </span>
        </span>
      </Link>
    </aside>
  );
}

export function GoLayout() {
  const loc = useLocation();
  const fullBleed = loc.pathname.startsWith('/find');
  return (
    <GoDataProvider>
      <div className="flex min-h-dvh">
        <Sidebar />
        <main id="main" className={cx('min-w-0 flex-1', !fullBleed && 'pb-nav')}>
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </GoDataProvider>
  );
}

/** Standard page width for Go screens. */
export function Page({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cx('mx-auto w-full px-4 pt-safe md:px-6', wide ? 'max-w-[1100px]' : 'max-w-[680px]', className)}>{children}</div>;
}
