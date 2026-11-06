import { describe, it, expect, vi } from 'vitest';
import {
  costForEnergy,
  finalCharge,
  limitReached,
  deliveredWh,
  canTransitionPayment,
  assertPaymentTransition,
  parseQrPayload,
  validateQr,
  newQrToken,
  can,
  canStartCharging,
  connectorTone,
  canTransitionListing,
  RpcEndpoint,
  CallTimeoutError,
  OcppError,
  negotiateSubprotocol,
  buildDemoNetwork,
} from './index';

describe('tariff', () => {
  it('computes cost from Wh', () => {
    expect(costForEnergy(5560, 33.5)).toBe(186.26);
    expect(costForEnergy(-5, 33.5)).toBe(0);
  });
  it('caps final charge at the hold', () => {
    expect(finalCharge(512.4, 500)).toBe(500);
    expect(finalCharge(186.26, 500)).toBe(186.26);
  });
  it('detects limit', () => {
    expect(limitReached(500, 500)).toBe(true);
    expect(limitReached(499.99, 500)).toBe(false);
  });
  it('guards meter resets', () => {
    expect(deliveredWh(1000, 500)).toBe(0);
    expect(deliveredWh(1000, 2500)).toBe(1500);
  });
});

describe('payment state machine', () => {
  it('allows hold → capture → refund', () => {
    expect(canTransitionPayment('created', 'authorized')).toBe(true);
    expect(canTransitionPayment('authorized', 'captured')).toBe(true);
    expect(canTransitionPayment('captured', 'refunded')).toBe(true);
  });
  it('forbids capture without authorization and refund of a void', () => {
    expect(canTransitionPayment('created', 'captured')).toBe(false);
    expect(canTransitionPayment('voided', 'refunded')).toBe(false);
    expect(() => assertPaymentTransition('failed', 'captured')).toThrow();
  });
});

describe('QR', () => {
  it('parses URL and bare token', () => {
    const t = newQrToken();
    expect(parseQrPayload(`https://app.achargex.ph/q/${t}`)).toBe(t);
    expect(parseQrPayload(t)).toBe(t);
    expect(parseQrPayload('https://evil.example/pay?card=4111')).toBeNull();
    expect(parseQrPayload('short')).toBeNull();
  });
  it('validates revocation and expiry', () => {
    const base = { token: newQrToken(), stationId: 's', createdAt: '2026-01-01T00:00:00Z' };
    expect(validateQr(undefined)).toEqual({ ok: false, reason: 'not_found' });
    expect(validateQr({ ...base, revokedAt: '2026-01-02T00:00:00Z' })).toEqual({ ok: false, reason: 'revoked' });
    expect(validateQr({ ...base, expiresAt: '2026-01-02T00:00:00Z' }, new Date('2026-02-01'))).toEqual({ ok: false, reason: 'expired' });
    expect(validateQr(base).ok).toBe(true);
  });
});

describe('roles', () => {
  it('guests cannot start sessions or manage stations', () => {
    expect(can('guest', 'stations:browse')).toBe(true);
    expect(can('guest', 'sessions:start')).toBe(false);
    expect(can('guest', 'network:manage_own_stations')).toBe(false);
  });
  it('operators cannot approve stations; admins can', () => {
    expect(can('operator', 'admin:approve_stations')).toBe(false);
    expect(can('admin', 'admin:approve_stations')).toBe(true);
    expect(can(undefined, 'stations:browse')).toBe(false);
  });
});

describe('charging eligibility', () => {
  const st = { listingStatus: 'approved' as const };
  const ch = { commissioned: true, connected: true };
  it('requires Available connector on a connected, commissioned, approved station', () => {
    expect(canStartCharging(st, ch, { status: 'Available' }).ok).toBe(true);
    expect(canStartCharging(st, ch, { status: 'Faulted' }).ok).toBe(false);
    expect(canStartCharging(st, { ...ch, connected: false }, { status: 'Available' }).ok).toBe(false);
    expect(canStartCharging({ listingStatus: 'pending' }, ch, { status: 'Available' }).ok).toBe(false);
  });
  it('maps tones', () => {
    expect(connectorTone('SuspendedEV')).toBe('busy');
    expect(connectorTone('Unavailable')).toBe('offline');
  });
  it('listing transitions', () => {
    expect(canTransitionListing('draft', 'pending', 'owner')).toBe(true);
    expect(canTransitionListing('pending', 'approved', 'owner')).toBe(false);
    expect(canTransitionListing('pending', 'approved', 'admin')).toBe(true);
  });
});

describe('OCPP RPC core', () => {
  function pair() {
    let a!: RpcEndpoint;
    let b!: RpcEndpoint;
    a = new RpcEndpoint({ send: (t) => queueMicrotask(() => b.receive(t)) });
    b = new RpcEndpoint({ send: (t) => queueMicrotask(() => a.receive(t)) });
    return { a, b };
  }

  it('correlates call and result by uniqueId', async () => {
    const { a, b } = pair();
    b.handle('Heartbeat', () => ({ currentTime: 'X' }));
    const [r1, r2] = await Promise.all([a.call('Heartbeat', {}), a.call('Heartbeat', {})]);
    expect(r1).toEqual({ currentTime: 'X' });
    expect(r2).toEqual({ currentTime: 'X' });
    expect(a.pendingCount).toBe(0);
  });

  it('returns NotImplemented for unknown actions', async () => {
    const { a } = pair();
    await expect(a.call('Nope', {})).rejects.toMatchObject({ code: 'NotImplemented' });
  });

  it('propagates OcppError from handlers', async () => {
    const { a, b } = pair();
    b.handle('Authorize', () => {
      throw new OcppError('SecurityError', 'bad');
    });
    await expect(a.call('Authorize', {})).rejects.toBeInstanceOf(OcppError);
  });

  it('times out when no response', async () => {
    vi.useFakeTimers();
    const a = new RpcEndpoint({ send: () => {} });
    const p = a.call('Reset', { type: 'Soft' }, 1000);
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toBeInstanceOf(CallTimeoutError);
    vi.useRealTimers();
  });

  it('replies ProtocolError to garbage', async () => {
    const sent: string[] = [];
    const a = new RpcEndpoint({ send: (t) => sent.push(t) });
    await a.receive('not json');
    expect(JSON.parse(sent[0])[2]).toBe('ProtocolError');
  });

  it('negotiates newest subprotocol', () => {
    expect(negotiateSubprotocol(['ocpp1.6', 'ocpp2.0.1'])).toBe('ocpp2.0.1');
    expect(negotiateSubprotocol(['ocpp1.6'])).toBe('ocpp1.6');
    expect(negotiateSubprotocol(['ocpp1.5'])).toBeNull();
  });
});

describe('demo network', () => {
  it('flags all demo chargers as simulated with SIM- prefix', () => {
    const net = buildDemoNetwork();
    expect(net.length).toBeGreaterThan(5);
    for (const s of net) {
      expect(s.isDemo).toBe(true);
      for (const c of s.chargers) {
        expect(c.isSimulated).toBe(true);
        expect(c.ocppIdentity.startsWith('SIM-')).toBe(true);
      }
    }
  });
});
