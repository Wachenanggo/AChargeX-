import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, UserRound, ArrowLeft } from 'lucide-react';
import { Logo, Button, Input, Notice } from '../../ui';
import { useAuth } from '../../auth/AuthProvider';
import { markOnboarded } from './Welcome';

function AuthShell({ title, sub, children, back = '/welcome' }: { title: string; sub: string; children: ReactNode; back?: string }) {
  const { mode } = useAuth();
  return (
    <div className="flex min-h-dvh justify-center bg-white">
      <div className="flex w-full max-w-[440px] flex-col px-5 pb-8 pt-safe">
        <div className="flex h-14 items-center justify-between">
          <Link to={back} aria-label="Back" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-ax-surface">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Logo />
          <span className="w-11" />
        </div>
        <h1 className="mt-6 text-[28px] font-extrabold tracking-[-0.8px]">{title}</h1>
        <p className="mt-1.5 text-[15px] text-ax-muted">{sub}</p>
        {mode === 'demo' && (
          <Notice tone="warn" title="Demo mode" className="mt-5">
            Supabase Auth isn't configured, so accounts are local to this device and nothing is sent to a server. See DEPLOY.md to enable real sign-in.
          </Notice>
        )}
        <div className="mt-6 flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

function useAfterAuth() {
  const nav = useNavigate();
  const loc = useLocation();
  return () => {
    markOnboarded();
    const next = new URLSearchParams(loc.search).get('next');
    nav(next && next.startsWith('/') ? next : '/', { replace: true });
  };
}

export function SignIn() {
  const { signIn, continueAsGuest, googleEnabled, signInWithGoogle } = useAuth();
  const done = useAfterAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(undefined);
    setBusy(true);
    try {
      await signIn(email.trim(), pw);
      done();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title="Welcome back" sub="Sign in to start charging and see your sessions.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="h-4 w-4 text-ax-muted" />} required />
        <Input label="Password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} leading={<Lock className="h-4 w-4 text-ax-muted" />} required />
        <Link to="/reset" className="-mt-1 self-end text-[13px] font-semibold text-ax-green-text">
          Forgot password?
        </Link>
        {err && <Notice tone="error">{err}</Notice>}
        <Button type="submit" size="lg" block loading={busy}>
          Sign in
        </Button>
      </form>
      {googleEnabled && (
        <Button variant="secondary" size="lg" block className="mt-3" onClick={() => signInWithGoogle().catch((x) => setErr((x as Error).message))}>
          Continue with Google
        </Button>
      )}
      <div className="my-6 flex items-center gap-3 text-[12px] text-ax-muted">
        <span className="h-px flex-1 bg-ax-border" /> or <span className="h-px flex-1 bg-ax-border" />
      </div>
      <Button
        variant="secondary"
        size="lg"
        block
        onClick={() => {
          continueAsGuest();
          done();
        }}
      >
        Browse as guest
      </Button>
      <p className="mt-2 text-center text-[12px] text-ax-muted">Guests can find stations and view details. Sign in to charge.</p>
      <p className="mt-auto pt-8 text-center text-[14px] text-ax-muted">
        New to AChargeX?{' '}
        <Link to="/signup" className="font-semibold text-ax-green-text">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export function SignUp() {
  const { signUp } = useAuth();
  const done = useAfterAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(undefined);
    setBusy(true);
    try {
      const r = await signUp(name, email.trim(), pw);
      if (r.needsConfirmation) setConfirm(true);
      else done();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (confirm)
    return (
      <AuthShell title="Check your email" sub={`We sent a confirmation link to ${email}.`} back="/signin">
        <Notice tone="success">Open the link on this device to finish creating your account.</Notice>
      </AuthShell>
    );
  return (
    <AuthShell title="Create your account" sub="Charge at AChargeX stations across the Philippines." back="/signin">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} leading={<UserRound className="h-4 w-4 text-ax-muted" />} />
        <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="h-4 w-4 text-ax-muted" />} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} leading={<Lock className="h-4 w-4 text-ax-muted" />} />
        {err && <Notice tone="error">{err}</Notice>}
        <Button type="submit" size="lg" block loading={busy}>
          Create account
        </Button>
        <p className="text-center text-[12px] leading-relaxed text-ax-muted">By creating an account you agree to the AChargeX terms and privacy policy.</p>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const { resetPassword, mode } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title="Reset password" sub="We'll email you a secure link to choose a new password." back="/signin">
      {sent ? (
        <Notice tone="success" title="Link sent">
          If an account exists for {email}, you'll receive a reset link shortly.
        </Notice>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(undefined);
            setBusy(true);
            try {
              await resetPassword(email.trim());
              setSent(true);
            } catch (x) {
              setErr((x as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="h-4 w-4 text-ax-muted" />} />
          {err && <Notice tone={mode === 'demo' ? 'warn' : 'error'}>{err}</Notice>}
          <Button type="submit" size="lg" block loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
