'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { LogoMark } from '@/components/second-brain/Logo';

function friendlyAuthError(raw: string, mode: 'signin' | 'signup'): string {
  const msg = raw.toLowerCase();
  if (msg.includes('invalidsecret') || msg.includes('invalid password') || msg.includes('invalidaccountid')) {
    return mode === 'signin'
      ? 'Wrong email or password. If you\'re new here, switch to sign up.'
      : 'An account with this email already exists — try signing in.';
  }
  if (msg.includes('account already exists')) return 'An account with this email already exists — try signing in.';
  if (msg.includes('password') && (msg.includes('short') || msg.includes('length') || msg.includes('validation'))) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Could not reach the server — check your connection and try again.';
  }
  return 'Authentication failed. Please try again.';
}

function passwordStrength(pw: string): { pct: number; label: string; color: string } {
  if (!pw) return { pct: 0, label: '', color: 'var(--t3)' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 8) return { pct: 18, label: 'too short', color: 'var(--red)' };
  if (score <= 2) return { pct: 40, label: 'weak', color: 'var(--red)' };
  if (score === 3) return { pct: 65, label: 'fair', color: 'var(--amb)' };
  if (score === 4) return { pct: 85, label: 'good', color: 'var(--grn)' };
  return { pct: 100, label: 'strong', color: 'var(--grn)' };
}

const SIGNUP_POINTS = [
  'A markdown editor where linking is one keystroke, and backlinks appear on their own.',
  'A graph that shows the shape of what you have been thinking about.',
  'An AI that has read your whole vault, and a tutor that teaches from it.',
];

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-code)', fontSize: 9.5, letterSpacing: '.09em',
  textTransform: 'uppercase', color: 'var(--t3)',
};

const FIELD: React.CSSProperties = {
  height: 36, padding: '0 11px', border: '1px solid var(--bd)', borderRadius: 7,
  background: 'var(--bg1)', fontSize: 13, outline: 'none', color: 'var(--t1)',
  fontFamily: 'inherit', width: '100%',
  transition: 'border-color .14s, box-shadow .14s',
};

function AuthContent() {
  const searchParams = useSearchParams();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (searchParams.get('mode') === 'signup') setMode('signup');
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) window.location.href = '/';
  }, [isAuthenticated, authLoading]);

  const isSignup = mode === 'signup';
  const pw = passwordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      if (isSignup && password.length < 8) throw new Error('Password must be at least 8 characters.');
      const params: Record<string, string> = {
        email, password, flow: isSignup ? 'signUp' : 'signIn',
      };
      if (isSignup) params.name = name || email.split('@')[0];
      await signIn('password', params);
      localStorage.setItem('second-brain-user', JSON.stringify({ email, name: name || email.split('@')[0] }));
      localStorage.removeItem('second-brain-demo');
      if (isSignup) localStorage.setItem('second-brain-new-user', 'true');
      window.location.href = '/';
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Something went wrong';
      setError(raw.includes('Password must be') ? raw : friendlyAuthError(raw, mode));
      setLoading(false);
    }
  };

  const focusOn = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--acc)';
    e.currentTarget.style.boxShadow = '0 0 0 3px var(--acc-a20)';
  };
  const focusOff = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--bd)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div className="auth-page">
      {/* ---------- form ---------- */}
      <div className="auth-form-col">
        <div style={{ width: 352, maxWidth: '100%', margin: 'auto 0' }}>
          <a href="/landing" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30, textDecoration: 'none' }}>
            <LogoMark size={15} />
            <span style={{ fontFamily: 'var(--font-code)', fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>braindot</span>
          </a>

          <div style={{ fontFamily: 'var(--font-reading-serif)', fontSize: 28, letterSpacing: '-0.6px', marginBottom: 6, color: 'var(--t1)' }}>
            {isSignup ? 'Start your vault' : 'Welcome back'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 26, lineHeight: 1.6 }}>
            {isSignup
              ? 'Everything syncs to the cloud, so your notes follow you between devices.'
              : 'Sign in to your notes, reading and canvas.'}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {isSignup && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={LABEL}>what should we call your vault</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Second desk"
                  autoComplete="name" onFocus={focusOn} onBlur={focusOff} style={FIELD} />
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={LABEL}>email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="you@example.com" autoComplete="email"
                onFocus={focusOn} onBlur={focusOff} style={FIELD} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={LABEL}>password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                placeholder="••••••••" autoComplete={isSignup ? 'new-password' : 'current-password'}
                onFocus={focusOn} onBlur={focusOff} style={FIELD} />
            </label>

            {isSignup && password.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: -3 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--bg3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: pw.color, width: `${pw.pct}%`, transition: 'width .2s' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-code)', fontSize: 9.5, color: pw.color, width: 66, textAlign: 'right' }}>
                  {pw.label}
                </span>
              </div>
            )}

            {!isSignup && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -2 }}>
                <button type="button" onClick={() => setRemember((r) => !r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--t2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                  <span style={{
                    width: 13, height: 13, borderRadius: 4,
                    border: `1.5px solid ${remember ? 'var(--acc)' : 'var(--bd2)'}`,
                    background: remember ? 'var(--acc)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--bg)', fontSize: 9,
                  }}>{remember ? '✓' : ''}</span>
                  Keep me signed in
                </button>
                <span style={{ flex: 1 }} />
              </div>
            )}

            {error && <div style={{ fontSize: 11.5, color: 'var(--red)', lineHeight: 1.5 }}>{error}</div>}

            <button type="submit" disabled={loading} style={{
              height: 38, borderRadius: 7, background: loading ? 'var(--bg3)' : 'var(--acc)',
              color: loading ? 'var(--t3)' : 'var(--bg)', fontSize: 13, fontWeight: 500,
              marginTop: 5, border: 'none', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}>
              {loading ? 'please wait…' : isSignup ? 'Create vault' : 'Sign in'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
            <span style={{ fontFamily: 'var(--font-code)', fontSize: 9.5, color: 'var(--t3)' }}>or</span>
            <span style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
          </div>

          <a href="/demo" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: 38, border: '1px solid var(--bd2)', borderRadius: 7,
            fontSize: 13, color: 'var(--t1)', textDecoration: 'none',
            transition: 'border-color .14s, color .14s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--acc)'; e.currentTarget.style.color = 'var(--acc)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bd2)'; e.currentTarget.style.color = 'var(--t1)'; }}
          >
            Continue in demo mode
          </a>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 12, lineHeight: 1.6 }}>
            Demo mode gives you the whole app with a sample vault. Nothing is persisted to the cloud.
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 24, fontSize: 12 }}>
            <span style={{ color: 'var(--t2)' }}>
              {isSignup ? 'Already have a vault?' : 'No vault yet?'}
            </span>
            <button type="button" onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(null); }}
              style={{ color: 'var(--acc)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0 }}>
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </div>

          <a href="/landing" style={{
            display: 'inline-block', marginTop: 26, fontFamily: 'var(--font-code)',
            fontSize: 10.5, color: 'var(--t3)', textDecoration: 'none',
          }}>
            ← back to braindot
          </a>
        </div>
      </div>

      {/* ---------- editorial panel ---------- */}
      <div className="auth-aside-col">
        <div style={{ maxWidth: 420, margin: 'auto 0' }}>
          {!isSignup ? (
            <>
              <div style={{
                fontFamily: 'var(--font-reading-serif)', fontSize: 26, lineHeight: 1.3,
                letterSpacing: '-0.5px', textWrap: 'pretty', color: 'var(--t1)',
              }}>
                “A perfect archive is a bad memory. Memory is useful because it is lossy — it
                discards the particular and keeps the shape.”
              </div>
              <div style={{ fontFamily: 'var(--font-code)', fontSize: 10.5, color: 'var(--t3)', marginTop: 18 }}>
                from a vault, three years in
              </div>
            </>
          ) : (
            <>
              <div style={{ ...LABEL, fontSize: 10, letterSpacing: '.1em', color: 'var(--acc)', marginBottom: 16 }}>
                what you get
              </div>
              <div style={{
                fontFamily: 'var(--font-reading-serif)', fontSize: 26, lineHeight: 1.25,
                letterSpacing: '-0.5px', textWrap: 'pretty', color: 'var(--t1)',
              }}>
                An empty vault, and everything that makes it worth filling.
              </div>
            </>
          )}

          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {SIGNUP_POINTS.map((p) => (
              <div key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 6, flexShrink: 0 }}><LogoMark size={11} /></span>
                <span style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--t2)' }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <AuthContent />
    </Suspense>
  );
}
