import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RequirePermission } from './auth/RequireRole';
import { GoLayout } from './go/GoLayout';
import { GoDataProvider } from './go/data';
import Home from './go/pages/Home';
import Welcome, { isOnboarded } from './go/pages/Welcome';
import { SignIn, SignUp, ResetPassword } from './go/pages/Auth';
import StationDetails from './go/pages/StationDetails';
import ChargeSetup from './go/pages/ChargeSetup';
import LiveSession from './go/pages/LiveSession';
import Sessions from './go/pages/Sessions';
import Garage from './go/pages/Garage';
import Wallet from './go/pages/Wallet';
import Scan, { QrResolve } from './go/pages/Scan';
import Account from './go/pages/Account';
import { Spinner, Notice, Button } from './ui';

const Find = lazy(() => import('./go/pages/Find'));
const NetworkApp = lazy(() => import('./network/NetworkApp'));
const ControlApp = lazy(() => import('./control/ControlApp'));

function Loading({ dark }: { dark?: boolean }) {
  return (
    <div className={`flex min-h-[60dvh] items-center justify-center ${dark ? 'bg-ctl-bg' : ''}`}>
      <Spinner />
    </div>
  );
}

function FirstRunGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user && !isOnboarded() && loc.pathname === '/') return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function SessionExpired() {
  const { sessionExpired, clearExpired, signOut } = useAuth();
  if (!sessionExpired) return null;
  return (
    <div className="fixed inset-x-4 top-4 z-[2000] mx-auto max-w-md">
      <Notice tone="warn" title="Your session expired">
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              clearExpired();
              await signOut();
              window.location.assign('/signin');
            }}
          >
            Sign in again
          </Button>
          <Button size="sm" variant="secondary" onClick={clearExpired}>
            Dismiss
          </Button>
        </div>
      </Notice>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SessionExpired />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[3000] focus:rounded-lg focus:bg-white focus:p-3">
          Skip to content
        </a>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route
              path="/session/:id"
              element={
                <RequirePermission permission="sessions:own">
                  <GoDataProvider>
                    <LiveSession />
                  </GoDataProvider>
                </RequirePermission>
              }
            />
            <Route
              element={
                <FirstRunGate>
                  <GoLayout />
                </FirstRunGate>
              }
            >
              <Route index element={<Home />} />
              <Route path="find" element={<Find />} />
              <Route path="station/:id" element={<StationDetails />} />
              <Route
                path="charge/:connectorId"
                element={
                  <RequirePermission permission="sessions:start">
                    <ChargeSetup />
                  </RequirePermission>
                }
              />
              <Route path="sessions" element={<Sessions />} />
              <Route path="garage" element={<Garage />} />
              <Route path="wallet" element={<Wallet />} />
              <Route path="scan" element={<Scan />} />
              <Route path="q/:token" element={<QrResolve />} />
              <Route path="account" element={<Account />} />
            </Route>
            <Route
              path="/network/*"
              element={
                <RequirePermission permission="network:manage_own_stations">
                  <Suspense fallback={<Loading />}>
                    <NetworkApp />
                  </Suspense>
                </RequirePermission>
              }
            />
            <Route
              path="/control/*"
              element={
                <RequirePermission permission="control:view" dark>
                  <Suspense fallback={<Loading dark />}>
                    <ControlApp />
                  </Suspense>
                </RequirePermission>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
