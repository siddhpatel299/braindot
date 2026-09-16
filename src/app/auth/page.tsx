'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ArrowRight, Eye, EyeOff, Play, Loader2, CircleAlert } from 'lucide-react';

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
 * What is on the other side of the form, said in the page's own voice.
 *
 * These were three icon pips: identical rounded squares holding three
 * different glyphs, which is decoration standing in for a reason to read the
 * sentence. A mono label on a hairline rule says the same thing and matches
 * how /landing labels everything else.
 */
const POINTS = [
  { k: 'Links', v: 'Type two brackets and the vault completes the link. The note on the other end grows a backlink without being opened.' },
  { k: 'Reading', v: 'EPUB, PDF, arXiv and articles open in-app, and what you highlight lands in the vault as a note you can link to.' },
  { k: 'Tutor', v: 'A tutor that has read all of it — and draws what it explains straight into the note you are writing.' },
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
      {/* ---------- The bar: the same one /landing has ---------------------
          A sign-in screen with no way back is a trap, and a wordmark alone is
          not a way back. */}
      <header className="auth-bar">
        <div className="auth-bar-in">
          <a className="auth-mark" href="/landing">
            braindot<span className="sb-caret sb-caret-blink" />
          </a>
          <span className="sp" />
          <a className="lnk" href="/demo">Demo</a>
          <a className="lnk" href="/landing">Back to site</a>
        </div>
      </header>

      <main className="auth-main">
        {/* ---------- The tell -------------------------------------------- */}
        <section className="auth-tell">
          <span className="auth-tagline">{signup ? 'Create a vault' : 'Sign in'}</span>
          <h1>Your notes, and everything they touch.</h1>
          <p className="sub">
            A thinking environment rather than a filing cabinet. Write in markdown,
            link as you go, and let the graph show you the shape of what you know.
          </p>
          <ul className="auth-points">
            {POINTS.map(({ k, v }) => (
              <li key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- The form -------------------------------------------- */}
        <div className="auth-card">
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
