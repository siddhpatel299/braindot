'use client';

import { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import {
  ArrowRight, Eye, EyeOff, Play, Link2, GraduationCap, BookOpen,
  Loader2, CircleAlert,
} from 'lucide-react';

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

/**
 * The field behind the card.
 *
 * The landing page runs a real force simulation; this page does not need one —
 * it is a form, and a physics loop behind a password field is spend with no
 * return. What it does need is structure behind the glass, so this is a fixed
 * constellation laid out from a seeded PRNG: same shape every load, no work
 * after the first paint.
 */
function Constellation() {
  const { nodes, edges } = useMemo(() => {
    // The LCG is unrolled into a fixed table rather than read through a
    // closure, so nothing is reassigned across renders — same numbers every
    // time, which is the point: the constellation should not reshuffle itself
    // when React re-renders the form around it.
    const COUNT = 34;
    const r: number[] = [];
    let s = 20260916;
    for (let i = 0; i < COUNT * 4; i++) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      r.push(s / 4294967296);
    }

    const n = Array.from({ length: COUNT }, (_, i) => ({
      x: r[i * 4] * 100,
      y: r[i * 4 + 1] * 100,
      r: 0.28 + r[i * 4 + 2] * 0.72,
    }));

    const e: Array<[number, number]> = [];
    for (let i = 0; i < n.length; i++) {
      // Join each node to its nearest one or two neighbours: that is what
      // makes a graph read as a graph rather than as scattered dots.
      const near = n
        .map((m, j) => ({ j, d: (m.x - n[i].x) ** 2 + (m.y - n[i].y) ** 2 }))
        .filter((m) => m.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, r[i * 4 + 3] > 0.55 ? 2 : 1);
      for (const m of near) if (i < m.j) e.push([i, m.j]);
    }
    return { nodes: n, edges: e };
  }, []);

  return (
    <svg
      className="auth-field-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="rgba(157,147,255,0.26)" strokeWidth="0.09">
        {edges.map(([a, b], i) => (
          <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} />
        ))}
      </g>
      <g fill="#9d93ff">
        {nodes.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.r * 0.42} opacity={0.35 + p.r * 0.4} />
        ))}
      </g>
    </svg>
  );
}

const PROOF = [
  { icon: Link2, text: 'Every note links to the rest of your thinking, and the backlinks write themselves.' },
  { icon: BookOpen, text: 'EPUB, PDF, arXiv and articles open in-app; what you highlight lands in the vault.' },
  { icon: GraduationCap, text: 'A tutor that has read all of it — and draws what it explains into the note.' },
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
  const errorRef = useRef<HTMLDivElement>(null);

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
      // Say it where the user is looking. role="alert" announces it, but a
      // sighted keyboard user still has to be taken to it.
      requestAnimationFrame(() => {
        errorRef.current?.focus();
        errorRef.current?.scrollIntoView({ block: 'nearest' });
      });
    }
  };

  const signup = mode === 'signup';

  return (
    <div className="auth world-ink">
      <div className="auth-wash" aria-hidden="true" />
      <Constellation />

      {/* ---------- The tell: what is on the other side of this form ------- */}
      <aside className="auth-tell">
        <a
          href="/landing"
          style={{ textDecoration: 'none', color: 'var(--ink-t1)', fontWeight: 800, fontSize: 20, letterSpacing: '-0.035em', display: 'inline-flex', alignItems: 'baseline' }}
        >
          braindot<span className="sb-caret sb-caret-blink" />
        </a>
        <h1>Your notes, and everything they touch.</h1>
        <p className="sub">
          A thinking environment rather than a filing cabinet. Write in markdown,
          link as you go, and let the graph show you the shape of what you know.
        </p>
        <ul className="auth-proof">
          {PROOF.map(({ icon: Icon, text }) => (
            <li key={text}>
              <span className="pip" aria-hidden="true"><Icon size={14} strokeWidth={1.9} /></span>
              <span className="t">{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* ---------- The form ---------------------------------------------- */}
      <main className="auth-form-col">
        <div className="auth-card g-pane">
          {/* Shown only once the tell is gone, so the page still says whose it is. */}
          <a className="auth-brand" href="/landing">
            braindot<span className="sb-caret sb-caret-blink" />
          </a>

          <div className="auth-switch" role="group" aria-label="Sign in or create an account">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-on={mode === m}
                aria-pressed={mode === m}
                onClick={() => { setMode(m); setError(null); }}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <h2>{signup ? 'Create your vault' : 'Welcome back'}</h2>
          <p className="blurb">
            {signup
              ? 'Free while in beta — no card. Everything syncs, so your vault follows you between devices.'
              : 'Sign in to your notes, your reading and your canvas.'}
          </p>

          {error && (
            <div className="auth-error" role="alert" ref={errorRef} tabIndex={-1}>
              <CircleAlert size={15} strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {signup && (
              <label className="auth-label" htmlFor="au-name">
                <span className="lbl">Name</span>
                <input
                  id="au-name"
                  className="auth-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  autoComplete="name"
                />
              </label>
            )}

            <label className="auth-label" htmlFor="au-email">
              <span className="lbl">Email</span>
              <input
                id="au-email"
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>

            <label className="auth-label" htmlFor="au-pw">
              <span className="lbl">Password</span>
              <span className="auth-pw">
                <input
                  id="au-pw"
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={signup ? 'At least 8 characters' : '••••••••'}
                  required
                  autoComplete={signup ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="auth-peek"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  title={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
                </button>
              </span>
            </label>

            <button type="submit" className="auth-submit" disabled={loading}>
              {/* The label stays put while the request is in flight: the moment
                  you are waiting to find out what a button did is the worst
                  moment for it to stop saying. */}
              {signup ? 'Create vault' : 'Sign in'}
              {loading
                ? <Loader2 size={16} className="sb-spin" aria-hidden />
                : <ArrowRight size={16} aria-hidden />}
            </button>
          </form>

          <div className="auth-or"><span>or</span></div>

          <a className="auth-demo" href="/demo">
            <Play size={14} strokeWidth={2} aria-hidden />
            Explore the demo — no account needed
          </a>

          <p className="auth-foot">
            {signup
              ? 'Free while in beta. No card, no spam.'
              : (
                <>
                  New here?{' '}
                  <button type="button" onClick={() => { setMode('signup'); setError(null); }}>
                    Create a vault
                  </button>
                </>
              )}
          </p>
        </div>
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: 'var(--ink-0)' }} />}>
      <AuthContent />
    </Suspense>
  );
}
