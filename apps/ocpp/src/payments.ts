/**
 * Provider-neutral payment adapters.
 * Only the Demo adapter is implemented. Real providers (GCash, Maya, cards, QR Ph) must be
 * implemented server-side with provider-hosted checkout/tokenization + verified webhooks.
 * A frontend redirect is never proof of payment.
 */
import { randomUUID } from 'node:crypto';
import { assertPaymentTransition, providerRegistry, finalCharge, type PaymentProvider, type PaymentTransaction } from '@achargex/shared';
import type { Store } from './store';

export interface PaymentAdapter {
  id: PaymentProvider;
  isDemo: boolean;
  authorize(userId: string, holdPhp: number, idempotencyKey: string): Promise<PaymentTransaction>;
  capture(tx: PaymentTransaction, amountPhp: number): Promise<PaymentTransaction>;
  void(tx: PaymentTransaction): Promise<PaymentTransaction>;
}

export class DemoPaymentAdapter implements PaymentAdapter {
  id = 'demo' as const;
  isDemo = true;
  constructor(private store: Store) {}

  async authorize(userId: string, holdPhp: number, idempotencyKey: string) {
    // Idempotency: same key returns the same transaction (no duplicate holds).
    for (const p of this.store.payments.values()) {
      if (p.idempotencyKey === idempotencyKey && p.userId === userId) return p;
    }
    const now = new Date().toISOString();
    const tx: PaymentTransaction = {
      id: randomUUID(),
      userId,
      provider: 'demo',
      state: 'created',
      holdAmount: holdPhp,
      idempotencyKey,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    };
    assertPaymentTransition(tx.state, 'authorized');
    tx.state = 'authorized';
    this.store.putPayment(tx);
    return tx;
  }

  async capture(tx: PaymentTransaction, amountPhp: number) {
    const amount = finalCharge(amountPhp, tx.holdAmount);
    if (amount <= 0) return this.void(tx);
    assertPaymentTransition(tx.state, 'captured');
    tx.state = 'captured';
    tx.capturedAmount = amount;
    this.store.putPayment(tx);
    return tx;
  }

  async void(tx: PaymentTransaction) {
    if (tx.state === 'voided') return tx;
    assertPaymentTransition(tx.state, 'voided');
    tx.state = 'voided';
    tx.capturedAmount = 0;
    this.store.putPayment(tx);
    return tx;
  }
}

export function configuredProviders() {
  return providerRegistry({
    demo: process.env.DEMO_PAYMENTS !== 'false',
    // Real providers become enabled only when their server-side adapters + credentials exist.
    gcash: false,
    maya: false,
    card: false,
    qrph: false,
  });
}
