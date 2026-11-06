import type { Role } from './types';

export type Permission =
  | 'stations:browse'
  | 'sessions:start'
  | 'sessions:own'
  | 'vehicles:own'
  | 'payments:own'
  | 'network:manage_own_stations'
  | 'control:view'
  | 'control:remote_commands'
  | 'control:reset'
  | 'control:configure'
  | 'admin:approve_stations'
  | 'admin:manage_users'
  | 'admin:audit'
  | 'admin:super';

const MATRIX: Record<Role, Permission[]> = {
  guest: ['stations:browse'],
  driver: ['stations:browse', 'sessions:start', 'sessions:own', 'vehicles:own', 'payments:own'],
  owner: [
    'stations:browse',
    'sessions:start',
    'sessions:own',
    'vehicles:own',
    'payments:own',
    'network:manage_own_stations',
  ],
  operator: [
    'stations:browse',
    'sessions:own',
    'vehicles:own',
    'payments:own',
    'control:view',
    'control:remote_commands',
  ],
  admin: [
    'stations:browse',
    'sessions:own',
    'vehicles:own',
    'payments:own',
    'control:view',
    'control:remote_commands',
    'control:reset',
    'control:configure',
    'admin:approve_stations',
    'admin:manage_users',
    'admin:audit',
  ],
  super_admin: [
    'stations:browse',
    'sessions:start',
    'sessions:own',
    'vehicles:own',
    'payments:own',
    'network:manage_own_stations',
    'control:view',
    'control:remote_commands',
    'control:reset',
    'control:configure',
    'admin:approve_stations',
    'admin:manage_users',
    'admin:audit',
    'admin:super',
  ],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

export const ROLE_LABEL: Record<Role, string> = {
  guest: 'Guest',
  driver: 'Driver',
  owner: 'Charger owner',
  operator: 'Station operator',
  admin: 'Administrator',
  super_admin: 'Super administrator',
};

export const ALL_ROLES: Role[] = ['guest', 'driver', 'owner', 'operator', 'admin', 'super_admin'];

export function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ALL_ROLES as string[]).includes(x);
}
