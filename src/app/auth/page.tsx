'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ArrowRight, Eye, EyeOff, Play, Network, GraduationCap, BookOpen } from 'lucide-react';

function friendlyAuthError(raw: string, mode: 'signin' | 'signup'): string {
  const msg = raw.toLowerCase();
  if (msg.includes('invalidsecret') || msg.includes('invalid password') || msg.includes('invalidaccountid')) {
    return mode === 'signin'
      ? 'Wrong email or password. If you\'re new here, switch to sign up.'
      : 'An account with this email already exists — try signing in.';
  }
  if (msg.includes('account already exists')) {
    return 'An account with this email already exists — try signing in.';
  }
  if (msg.includes('password') && (msg.includes('short') || msg.includes('length') || msg.includes('validation'))) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Could not reach the server — check your connection and try again.';
  }
  return 'Authentication failed. Please try again.';
}

// Lines the preview types out. Deliberately looks like a real note being
// written, with the caret — the logo — doing the writing.
const TYPED_LINES = [
  '# Spaced repetition',
  '',
  'Review just before you would forget.',
  'Each gap longer than the last.',
  '',
  'Connects to [[Zettelkasten]].',
];

function TypingPreview() {
  const [text, setText] = useState('');
  const idx = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const full = TYPED_LINES.join('\n');
    if (reduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(full);
      return;
    }
    const t = setInterval(() => {
      idx.current += 1;
      if (idx.current > full.length) {
        idx.current = 0;
      }
      setText(full.slice(0, idx.current));
    }, 55);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      background: 'var(--bg1)',
      border: '1px solid #232329',
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 20px 50px -24px rgba(0,0,0,0.9)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '9px 12px', background: 'var(--bg2)', borderBottom: '1px solid #232329',
      }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--red)' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--amb)' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--grn)' }} />
        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--t3)' }}>spaced-repetition.md</span>
      </div>
      <pre style={{
        margin: 0, padding: '16px 18px', minHeight: 168,
        fontFamily: "var(--font-ui)", fontSize: 12.5, lineHeight: 1.75,
        color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {text}
        <span className="sb-caret sb-caret-blink" />
      </pre>
    </div>
  );
}

const CAPABILITIES = [
  { icon: Network, text: 'Notes that link to each other, and a graph that shows the shape of your thinking' },
  { icon: GraduationCap, text: 'An AI study tutor that quizzes you and draws diagrams, saved straight into your notes' },
  { icon: BookOpen, text: 'Read articles, papers and books in-app; highlights flow into your vault' },
];

function AuthContent() {
  const searchParams = useSearchParams();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (searchParams.get('mode') === 'signup') setMode('signup');
  }, [searchParams]);

  // Already signed in → straight to the app
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup' && password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }
      const params: Record<string, string> = {
        email,
        password,
        flow: mode === 'signup' ? 'signUp' : 'signIn',
      };
      if (mode === 'signup') {
        params.name = name || email.split('@')[0];
      }
      await signIn('password', params);

      // Minimal profile info for UI display — the actual session is a
      // server-verified Convex Auth token.
      localStorage.setItem('second-brain-user', JSON.stringify({
        email,
        name: name || email.split('@')[0],
      }));
      localStorage.removeItem('second-brain-demo');
      if (mode === 'signup') {
        localStorage.setItem('second-brain-new-user', 'true');
      }
      window.location.href = '/';
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Something went wrong';
      setError(raw.includes('Password must be') ? raw : friendlyAuthError(raw, mode));
      setLoading(false);
    }
  };

  const field: React.CSSProperties = {
    width: '100%', background: 'var(--bg2)', border: '1px solid #2c2c34',
    borderRadius: 6, padding: '11px 12px', color: 'var(--t1)', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', caretColor: 'var(--acc2)',
    transition: 'border-color 0.14s, box-shadow 0.14s',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
    color: 'var(--t3)', fontWeight: 600, marginBottom: 6, display: 'block',
  };
  const focusOn = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--acc)';
    e.currentTarget.style.boxShadow = '0 0 0 3px var(--acc-a20)';
  };
  const focusOff = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--bd2)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div className="auth-page" style={{ fontFamily: "var(--font-ui)" }}>
      {/* ---------- LEFT: what you're signing up for ---------- */}
      <aside className="auth-aside">
        <a href="/landing" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'baseline', marginBottom: 34 }}>
          <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em', color: 'var(--t1)', display: 'inline-flex', alignItems: 'baseline' }}>
            braindot<span className="sb-caret sb-caret-blink" />
          </span>
        </a>

        <h2 style={{
          fontSize: 27, lineHeight: 1.22, fontWeight: 700, letterSpacing: '-0.025em',
          color: 'var(--t1)', margin: '0 0 12px', maxWidth: '15ch',
        }}>
          Your knowledge, connected.
        </h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--t3)', margin: '0 0 30px', maxWidth: '46ch' }}>
          A thinking environment, not a filing cabinet. Write in markdown, link
          everything, and let AI help you see the patterns.
        </p>

        <TypingPreview />

        <ul style={{ listStyle: 'none', padding: 0, margin: '30px 0 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {CAPABILITIES.map(({ icon: Icon, text }) => (
            <li key={text} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0, width: 24, height: 24, borderRadius: 6,
                background: 'var(--acc-a10)', border: '1px solid var(--acc-a30)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
              }}>
                <Icon size={12} color="var(--acc2)" />
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t2)' }}>{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* ---------- RIGHT: the form ---------- */}
      <main className="auth-main">
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* brand shows here only when the aside is hidden (mobile) */}
          <a href="/landing" className="auth-mobile-brand" style={{ textDecoration: 'none', marginBottom: 26 }}>
            <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--t1)', display: 'inline-flex', alignItems: 'baseline' }}>
              braindot<span className="sb-caret sb-caret-blink" />
            </span>
          </a>

          <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', borderRadius: 7, padding: 3, marginBottom: 26 }}>
            {(['signin', 'signup'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); }} style={{
                flex: 1, padding: '9px 0', borderRadius: 5,
                background: mode === m ? 'var(--bg3)' : 'transparent',
                border: 'none', color: mode === m ? 'var(--t1)' : 'var(--t3)',
                fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                transition: 'background 0.14s, color 0.14s',
              }}>{m === 'signin' ? 'sign in' : 'sign up'}</button>
            ))}
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t1)', margin: '0 0 7px', letterSpacing: '-0.025em' }}>
            {mode === 'signup' ? 'Create your vault' : 'Welcome back'}
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--t3)', margin: '0 0 26px', lineHeight: 1.6 }}>
            {mode === 'signup'
              ? 'Everything syncs to the cloud, so your vault follows you between devices.'
              : 'Sign in to your notes, reading and canvas.'}
          </p>

          {error && (
            <div role="alert" style={{
              background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 6, padding: '10px 12px', marginBottom: 16,
              fontSize: 12, color: 'var(--red)', lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mode === 'signup' && (
              <div>
                <label htmlFor="au-name" style={labelStyle}>name</label>
                <input id="au-name" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="your name" required autoComplete="name"
                  onFocus={focusOn} onBlur={focusOff} style={field} />
              </div>
            )}
            <div>
              <label htmlFor="au-email" style={labelStyle}>email</label>
              <input id="au-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required autoComplete="email"
                onFocus={focusOn} onBlur={focusOff} style={field} />
            </div>
            <div>
              <label htmlFor="au-pw" style={labelStyle}>password</label>
              <div style={{ position: 'relative' }}>
                <input id="au-pw" type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'at least 8 characters' : '••••••••'} required
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onFocus={focusOn} onBlur={focusOff} style={{ ...field, paddingRight: 42 }} />
                <button type="button" onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  title={showPw ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    width: 30, height: 30, borderRadius: 5, background: 'transparent',
                    border: 'none', color: 'var(--t3)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              marginTop: 4, padding: '12px 0',
              background: loading ? 'var(--bg3)' : 'var(--acc)',
              color: loading ? 'var(--t3)' : '#fff', border: 'none', borderRadius: 6,
              fontSize: 13, fontFamily: 'inherit', cursor: loading ? 'wait' : 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'background 0.14s',
            }}>
              {loading
                ? 'please wait…'
                : (<>{mode === 'signup' ? 'Create vault' : 'Sign in'}<ArrowRight size={14} /></>)}
            </button>
          </form>

          {/* Demo promoted to a real action — the lowest-friction way in */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--bg3)' }} />
            <span style={{ fontSize: 10.5, color: 'var(--t3)', letterSpacing: '0.06em' }}>OR</span>
            <span style={{ flex: 1, height: 1, background: 'var(--bg3)' }} />
          </div>

          <a href="/demo" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '11px 0', borderRadius: 6, textDecoration: 'none',
            background: 'transparent', border: '1px solid #2c2c34',
            color: 'var(--t2)', fontSize: 12.5, fontWeight: 600,
            transition: 'border-color 0.14s, color 0.14s, background 0.14s',
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--acc)';
              e.currentTarget.style.color = 'var(--t1)';
              e.currentTarget.style.background = 'var(--acc-a10)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--bd2)';
              e.currentTarget.style.color = 'var(--t2)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Play size={12} />
            Explore the demo — no account needed
          </a>

          <p style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', marginTop: 18, lineHeight: 1.6 }}>
            {mode === 'signup'
              ? 'Free while in beta. No card, no spam.'
              : <>New here? <button type="button" onClick={() => { setMode('signup'); setError(null); }} style={{ background: 'none', border: 'none', color: 'var(--acc2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, padding: 0, textDecoration: 'underline' }}>Create a vault</button></>}
          </p>
        </div>
      </main>
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
