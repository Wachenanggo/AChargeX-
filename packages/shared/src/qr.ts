import type { QrCode } from './types';

/** QR payloads are a URL to a controlled resolver with an opaque token. Nothing else is encoded. */
export const QR_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function qrUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/q/${token}`;
}

/** Extract a token from a scanned string (full URL or bare token). Returns null if malformed. */
export function parseQrPayload(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/\/q\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/);
  const token = m ? m[1] : s;
  return QR_TOKEN_RE.test(token) ? token : null;
}

export type QrValidation =
  | { ok: true; qr: QrCode }
  | { ok: false; reason: 'malformed' | 'not_found' | 'revoked' | 'expired' };

export function validateQr(qr: QrCode | undefined, now: Date = new Date()): QrValidation {
  if (!qr) return { ok: false, reason: 'not_found' };
  if (qr.revokedAt) return { ok: false, reason: 'revoked' };
  if (qr.expiresAt && new Date(qr.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, qr };
}

/** Random URL-safe opaque token (works in browser and Node 20+). */
export function newQrToken(bytes = 18): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const QR_ERROR_TEXT: Record<'malformed' | 'not_found' | 'revoked' | 'expired', string> = {
  malformed: "This QR code isn't an AChargeX charger code.",
  not_found: "We couldn't find a charger for this code.",
  revoked: 'This charger code has been withdrawn by the operator.',
  expired: 'This temporary charger code has expired.',
};
