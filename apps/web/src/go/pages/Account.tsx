import { useNavigate, Link } from 'react-router-dom';
import { LogOut, Building2, Gauge, Headset, ChevronRight, History, FlaskConical, Mail, Phone } from 'lucide-react';
import { can, ROLE_LABEL, type Role } from '@achargex/shared';
import { Button, Card, DemoBadge, Notice, SectionTitle, ButtonLink } from '../../ui';
import { useAuth } from '../../auth/AuthProvider';
import { useGo } from '../data';
import { Page } from '../GoLayout';
import { cx } from '../../lib/format';

const DEMO_ROLES: Role[] = ['driver', 'owner', 'operator', 'admin'];

export default function Account() {
  const { user, mode, signOut, setDemoRoleFor } = useAuth();
  const { config, offline } = useGo();
  const nav = useNavigate();

  return (
    <Page>
      <h1 className="pt-6 text-[26px] font-extrabold tracking-[-0.6px] lg:pt-8">Account</h1>

      <Card className="mt-5 flex items-center gap-3 p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ax-navy text-[18px] font-bold text-white">{(user?.name ?? 'G').slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold">{user?.name ?? 'Guest'}</p>
          <p className="flex items-center gap-2 truncate text-[13px] text-ax-muted">
            {user?.email ?? ROLE_LABEL[user?.role ?? 'guest']} {user?.isDemo && <DemoBadge />}
          </p>
        </div>
        {(!user || user.role === 'guest') && <ButtonLink to="/signin" size="sm">Sign in</ButtonLink>}
      </Card>

      <SectionTitle className="mt-7">Your AChargeX</SectionTitle>
      <Card className="mt-3 divide-y divide-ax-border">
        <Row to="/sessions" icon={<History className="h-5 w-5" />} label="Charging sessions" />
        {user && can(user.role, 'network:manage_own_stations') && <Row to="/network" icon={<Building2 className="h-5 w-5" />} label="AChargeX Network" sub="Manage your stations" />}
        {user && can(user.role, 'control:view') && <Row to="/control" icon={<Gauge className="h-5 w-5" />} label="AChargeX Control" sub="Chargers, sessions and operations" />}
        {user && !can(user.role, 'network:manage_own_stations') && user.role !== 'guest' && <Row to="/network" icon={<Building2 className="h-5 w-5" />} label="Own a charger?" sub="List it on AChargeX Network" />}
      </Card>

      {mode === 'demo' && (
        <>
          <SectionTitle className="mt-7">Demo mode</SectionTitle>
          <Card className="mt-3 p-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <FlaskConical className="h-4 w-4 text-ax-green-text" /> Explore as a different role
            </p>
            <p className="mt-1 text-[13px] text-ax-muted">Only available while Supabase Auth isn't configured. Real roles are assigned server-side.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={user?.role === r}
                  onClick={() => setDemoRoleFor(r)}
                  className={cx('h-11 rounded-[12px] border text-[13px] font-semibold', user?.role === r ? 'border-ax-navy bg-ax-navy text-white' : 'border-ax-border hover:bg-ax-surface')}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </Card>
        </>
      )}

      <SectionTitle className="mt-7">
        <span id="support">Support</span>
      </SectionTitle>
      <Card className="mt-3 divide-y divide-ax-border">
        <a href="mailto:support@achargex.ph" className="flex items-center gap-3 p-4 hover:bg-ax-bg">
          <Mail className="h-5 w-5" /> <span className="flex-1 text-[14px] font-semibold">support@achargex.ph</span>
        </a>
        <div className="flex items-center gap-3 p-4 text-[14px] text-ax-muted">
          <Phone className="h-5 w-5" /> On-site emergencies: use the charger's emergency stop and call the number on the station signage.
        </div>
        <div className="flex items-center gap-3 p-4 text-[13px] text-ax-muted">
          <Headset className="h-5 w-5" /> Service: {offline ? 'unreachable (preview mode)' : config?.demoMode ? 'demo mode · simulator' : 'live'}
        </div>
      </Card>

      {mode === 'demo' && (
        <Notice tone="warn" className="mt-6" title="This build is a demo">
          Stations, chargers and payments are simulated. Configure Supabase and a payment provider for production — see DEPLOY.md.
        </Notice>
      )}

      {user && (
        <Button
          variant="secondary"
          block
          size="lg"
          className="mt-6"
          icon={<LogOut className="h-4 w-4" />}
          onClick={async () => {
            await signOut();
            nav('/signin');
          }}
        >
          Sign out
        </Button>
      )}
    </Page>
  );
}

function Row({ to, icon, label, sub }: { to: string; icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-4 hover:bg-ax-bg">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ax-surface">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{label}</span>
        {sub && <span className="block text-[12px] text-ax-muted">{sub}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-ax-muted" />
    </Link>
  );
}
