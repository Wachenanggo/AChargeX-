/**
 * OCPP-J (JSON over WebSocket) RPC core — version-agnostic and runtime-agnostic.
 * Works with OCPP 1.6J and 2.0.1 (same framing). No Node-only APIs, so it can run
 * in Node (`ws`), a browser, or a Cloudflare Durable Object.
 *
 *   CALL       [2, uniqueId, action, payload]
 *   CALLRESULT [3, uniqueId, payload]
 *   CALLERROR  [4, uniqueId, errorCode, errorDescription, errorDetails]
 */

export const CALL = 2;
export const CALLRESULT = 3;
export const CALLERROR = 4;

export type OcppErrorCode =
  | 'NotImplemented'
  | 'NotSupported'
  | 'InternalError'
  | 'ProtocolError'
  | 'SecurityError'
  | 'FormationViolation'
  | 'FormatViolation'
  | 'PropertyConstraintViolation'
  | 'OccurenceConstraintViolation'
  | 'OccurrenceConstraintViolation'
  | 'TypeConstraintViolation'
  | 'GenericError'
  | 'RpcFrameworkError'
  | 'MessageTypeNotSupported';

export type Frame =
  | { type: typeof CALL; id: string; action: string; payload: Record<string, unknown> }
  | { type: typeof CALLRESULT; id: string; payload: Record<string, unknown> }
  | { type: typeof CALLERROR; id: string; code: string; description: string; details: Record<string, unknown> };

export class OcppError extends Error {
  constructor(
    public code: OcppErrorCode | string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'OcppError';
  }
}

export class CallTimeoutError extends Error {
  constructor(public action: string, public timeoutMs: number) {
    super(`No response to ${action} within ${timeoutMs}ms`);
    this.name = 'CallTimeoutError';
  }
}

export function parseFrame(text: string): Frame {
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    throw new OcppError('ProtocolError', 'Frame is not valid JSON');
  }
  if (!Array.isArray(arr) || arr.length < 3) throw new OcppError('ProtocolError', 'Frame must be a JSON array');
  const [type, id] = arr as [unknown, unknown];
  if (typeof id !== 'string' || id.length === 0 || id.length > 36) {
    throw new OcppError('ProtocolError', 'Invalid uniqueId');
  }
  if (type === CALL) {
    const action = arr[2];
    const payload = arr[3] ?? {};
    if (typeof action !== 'string') throw new OcppError('ProtocolError', 'Action must be a string');
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new OcppError('FormationViolation', 'Payload must be an object');
    }
    return { type: CALL, id, action, payload: payload as Record<string, unknown> };
  }
  if (type === CALLRESULT) {
    const payload = arr[2] ?? {};
    return { type: CALLRESULT, id, payload: (payload ?? {}) as Record<string, unknown> };
  }
  if (type === CALLERROR) {
    return {
      type: CALLERROR,
      id,
      code: String(arr[2] ?? 'GenericError'),
      description: String(arr[3] ?? ''),
      details: (arr[4] ?? {}) as Record<string, unknown>,
    };
  }
  throw new OcppError('MessageTypeNotSupported', `Unknown message type ${String(type)}`);
}

export const encodeCall = (id: string, action: string, payload: object) => JSON.stringify([CALL, id, action, payload]);
export const encodeResult = (id: string, payload: object) => JSON.stringify([CALLRESULT, id, payload]);
export const encodeError = (id: string, code: string, description: string, details: object = {}) =>
  JSON.stringify([CALLERROR, id, code, description, details]);

export type CallHandler = (payload: Record<string, unknown>, action: string) => Promise<object> | object;

interface Pending {
  action: string;
  resolve: (p: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let counter = 0;
export function newMessageId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RpcEndpointOptions {
  send: (text: string) => void;
  /** Called for every raw frame in/out — used for the OCPP message log. */
  onFrame?: (direction: 'in' | 'out', text: string) => void;
  defaultTimeoutMs?: number;
}

/**
 * One side of an OCPP-J connection. Correlates outgoing CALLs with their
 * CALLRESULT/CALLERROR by uniqueId, enforces timeouts, and dispatches
 * incoming CALLs to registered handlers. Unknown actions get NotImplemented.
 */
export class RpcEndpoint {
  private handlers = new Map<string, CallHandler>();
  private pending = new Map<string, Pending>();
  private closed = false;

  constructor(private opts: RpcEndpointOptions) {}

  handle(action: string, handler: CallHandler): this {
    this.handlers.set(action, handler);
    return this;
  }

  private out(text: string) {
    this.opts.onFrame?.('out', text);
    this.opts.send(text);
  }

  call(action: string, payload: object, timeoutMs = this.opts.defaultTimeoutMs ?? 30_000): Promise<Record<string, unknown>> {
    if (this.closed) return Promise.reject(new Error('Connection closed'));
    const id = newMessageId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CallTimeoutError(action, timeoutMs));
      }, timeoutMs);
      this.pending.set(id, { action, resolve, reject, timer });
      try {
        this.out(encodeCall(id, action, payload));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  async receive(text: string): Promise<void> {
    this.opts.onFrame?.('in', text);
    let frame: Frame;
    try {
      frame = parseFrame(text);
    } catch (e) {
      // Best effort: try to recover the uniqueId for the error reply.
      let id = '-1';
      try {
        const a = JSON.parse(text);
        if (Array.isArray(a) && typeof a[1] === 'string') id = a[1];
      } catch {
        /* ignore */
      }
      const err = e as OcppError;
      this.out(encodeError(id, err.code ?? 'ProtocolError', err.message));
      return;
    }

    if (frame.type === CALL) {
      const handler = this.handlers.get(frame.action);
      if (!handler) {
        this.out(encodeError(frame.id, 'NotImplemented', `Action ${frame.action} is not implemented`));
        return;
      }
      try {
        const res = await handler(frame.payload, frame.action);
        this.out(encodeResult(frame.id, res));
      } catch (e) {
        if (e instanceof OcppError) this.out(encodeError(frame.id, e.code, e.message, e.details));
        else this.out(encodeError(frame.id, 'InternalError', (e as Error).message ?? 'Internal error'));
      }
      return;
    }

    const p = this.pending.get(frame.id);
    if (!p) return; // late or unknown response — ignore
    this.pending.delete(frame.id);
    clearTimeout(p.timer);
    if (frame.type === CALLRESULT) p.resolve(frame.payload);
    else p.reject(new OcppError(frame.code, frame.description || frame.code, frame.details));
  }

  close() {
    this.closed = true;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Connection closed'));
    }
    this.pending.clear();
  }

  get pendingCount() {
    return this.pending.size;
  }
}

/** Subprotocols we accept, newest first. */
export const SUPPORTED_SUBPROTOCOLS = ['ocpp2.0.1', 'ocpp1.6'] as const;

/** Choose the best mutually-supported subprotocol from the charger's offer. */
export function negotiateSubprotocol(offered: string[]): 'ocpp2.0.1' | 'ocpp1.6' | null {
  const norm = offered.map((s) => s.trim().toLowerCase());
  if (norm.includes('ocpp2.0.1') || norm.includes('ocpp2.0')) return 'ocpp2.0.1';
  if (norm.includes('ocpp1.6') || norm.includes('ocpp1.6j')) return 'ocpp1.6';
  return null;
}
