import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { can, type Permission } from '@achargex/shared';
import { useAuth } from './AuthProvider';
import { ButtonLink, EmptyState, Spinner } from '../ui';

/**
 * Client-side route guard for UX only — the OCPP service and Supabase RLS
 * enforce every permission server-side.
 */
export function RequirePermission({ permission, children, dark }: { permission: Permission; children: ReactNode; dark?: boolean }) {
  const { user, loading, mode } = useAuth();
  const loc = useLocation();
  if (loading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  if (!user || user.role === 'guest') return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!can(user.role, permission))
    return (
      <div className={dark ? 'min-h-dvh bg-ctl-bg text-ctl-text' : 'min-h-dvh'}>
        <EmptyState
          className="pt-24"
          title="You don't have access"
          action={
            <div className="flex flex-col items-center gap-2">
              <ButtonLink to="/">Back to AChargeX Go</ButtonLink>
              {mode === 'demo' && <ButtonLink to="/account" variant="secondary">Switch demo role</ButtonLink>}
            </div>
          }
        >
          This area needs a different role. Access is checked on the server for every request.
        </EmptyState>
      </div>
    );
  return <>{children}</>;
}
