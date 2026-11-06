import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Keyboard, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import jsQR from 'jsqr';
import { parseQrPayload, QR_ERROR_TEXT } from '@achargex/shared';
import { Button, Input, Notice, Card } from '../../ui';
import { api } from '../../lib/api';
import { Page } from '../GoLayout';

type Resolve = { ok: true; stationId: string; connectorId?: string } | { ok: false; reason: 'malformed' | 'not_found' | 'revoked' | 'expired' };

/** Resolve → navigate. Never starts charging, authorizes, or touches connector state. */
async function resolveToken(raw: string): Promise<{ to?: string; error?: string }> {
  const token = parseQrPayload(raw);
  if (!token) return { error: QR_ERROR_TEXT.malformed };
  try {
    const r = await api<Resolve>(`/api/qr/${encodeURIComponent(token)}`);
    if (!r.ok) return { error: QR_ERROR_TEXT[r.reason] };
    return { to: `/station/${r.stationId}${r.connectorId ? `?connector=${r.connectorId}` : ''}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export default function Scan() {
  const nav = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [camState, setCamState] = useState<'idle' | 'starting' | 'on' | 'denied' | 'unsupported'>('idle');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const streamRef = useRef<MediaStream>();
  const doneRef = useRef(false);

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = undefined;
  };
  useEffect(() => stopCam, []);

  const handle = async (raw: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setBusy(true);
    setErr(undefined);
    const r = await resolveToken(raw);
    setBusy(false);
    if (r.to) {
      stopCam();
      nav(r.to);
    } else {
      setErr(r.error);
      setTimeout(() => (doneRef.current = false), 1500);
    }
  };

  const startCam = async () => {
    setErr(undefined);
    if (!navigator.mediaDevices?.getUserMedia) return setCamState('unsupported');
    setCamState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setCamState('on');
      const tick = () => {
        if (!streamRef.current) return;
        const c = canvasRef.current!;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          const w = 480;
          const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
          if (code?.data) void handle(code.data);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setCamState('denied');
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    doneRef.current = false;
    void handle(manual);
  };

  return (
    <Page>
      <h1 className="pt-6 text-[26px] font-extrabold tracking-[-0.6px] lg:pt-8">Scan charger QR</h1>
      <p className="mt-1 text-[14px] text-ax-muted">Find the AChargeX label on the charger or connector.</p>

      <div className="relative mt-5 aspect-square w-full overflow-hidden rounded-[24px] bg-ax-navy-deep sm:aspect-[4/3]">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-label="Camera preview" />
        <canvas ref={canvasRef} className="hidden" />
        {camState !== 'on' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ax-navy-card">
              {camState === 'starting' ? <Loader2 className="h-7 w-7 animate-spin text-ax-green" /> : camState === 'denied' || camState === 'unsupported' ? <AlertTriangle className="h-7 w-7 text-ax-deal" /> : <Camera className="h-7 w-7 text-ax-green" />}
            </span>
            <p className="max-w-[260px] text-[14px] text-ax-navy-sub">
              {camState === 'denied'
                ? 'Camera access was blocked. Allow it in your browser settings, or enter the code below.'
                : camState === 'unsupported'
                  ? 'This device can’t open the camera here. Enter the code printed under the QR instead.'
                  : 'We only use the camera to read the charger code.'}
            </p>
            {(camState === 'idle' || camState === 'denied') && (
              <Button variant="charge" onClick={startCam} icon={<Camera className="h-4 w-4" />}>
                {camState === 'denied' ? 'Try again' : 'Open camera'}
              </Button>
            )}
          </div>
        )}
        {camState === 'on' && (
          <div className="pointer-events-none absolute inset-[18%] rounded-[24px] border-[3px] border-ax-green shadow-[0_0_0_9999px_rgba(17,26,43,.45)]" aria-hidden />
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-ax-navy-deep/60">
            <Loader2 className="h-8 w-8 animate-spin text-ax-green" />
          </div>
        )}
      </div>

      {err && (
        <Notice tone="error" className="mt-4">
          {err}
        </Notice>
      )}

      <Card className="mt-5 p-4">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input label="Enter code manually" placeholder="e.g. demo_axmtnb1311_qr0001" value={manual} onChange={(e) => setManual(e.target.value)} leading={<Keyboard className="h-4 w-4 text-ax-muted" />} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <Button type="submit" variant="secondary" loading={busy} disabled={!manual.trim()}>
            Find charger
          </Button>
        </form>
      </Card>
      <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ax-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ax-green-text" aria-hidden />
        Scanning only opens the charger. Nothing starts and nothing is charged until you choose a limit and confirm payment.
      </p>
    </Page>
  );
}

/** Deep link target for printed QR labels: /q/:token */
export function QrResolve() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    void resolveToken(token).then((r) => (r.to ? nav(r.to, { replace: true }) : setErr(r.error)));
  }, [token, nav]);
  return (
    <Page>
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
        {err ? (
          <>
            <AlertTriangle className="h-10 w-10 text-ax-deal" />
            <p className="max-w-xs text-[15px]">{err}</p>
            <Button onClick={() => nav('/scan')}>Scan another code</Button>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-ax-green-text" />
            <p className="text-[14px] text-ax-muted">Opening charger…</p>
          </>
        )}
      </div>
    </Page>
  );
}
