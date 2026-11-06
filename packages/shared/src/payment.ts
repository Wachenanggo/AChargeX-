import type { PaymentState, PaymentProvider } from './types';

/**
 * Payment lifecycle. Preauthorization (hold) → capture (final, ≤ hold) → optional refund.
 * A hold that is never captured is voided (released).
 */
const TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  created: ['pending', 'authorized', 'failed'],
  pending: ['authorized', 'failed'],
  authorized: ['captured', 'voided', 'failed'],
  captured: ['partially_refunded', 'refunded'],
  partially_refunded: ['refunded', 'partially_refunded'],
  refunded: [],
  voided: [],
  failed: [],
};

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`Invalid payment transition ${from} → ${to}`);
  }
}

export interface ProviderInfo {
  id: PaymentProvider;
  name: string;
  short: string;
  /** Whether this provider has server credentials configured. Only enabled providers are shown. */
  enabled: boolean;
  isDemo: boolean;
}

/** Provider registry. Real providers stay disabled until server-side credentials exist. */
export function providerRegistry(configured: Partial<Record<PaymentProvider, boolean>>): ProviderInfo[] {
  return [
    { id: 'demo', name: 'Demo wallet', short: 'DM', enabled: configured.demo ?? true, isDemo: true },
    { id: 'gcash', name: 'GCash', short: 'GC', enabled: !!configured.gcash, isDemo: false },
    { id: 'maya', name: 'Maya', short: 'MY', enabled: !!configured.maya, isDemo: false },
    { id: 'card', name: 'Credit / debit card', short: 'CD', enabled: !!configured.card, isDemo: false },
    { id: 'qrph', name: 'QR Ph', short: 'QR', enabled: !!configured.qrph, isDemo: false },
  ];
}
