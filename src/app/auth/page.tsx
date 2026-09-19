'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ArrowRight, Eye, EyeOff, Play, Loader2, CircleAlert, MailCheck } from 'lucide-react';

/** Which question the card is asking. The first two are the same form under a
 *  switch; the last two are the two halves of a password reset. */
type View = 'signin' | 'signup' | 'forgot' | 'verify';

/** The deployment cannot send at all — no reset provider wired up, or the
 *  SITE_URL every Convex Auth code flow is built on is unset. Neither is
 *  something the person at the keyboard can retry their way out of. */
function misconfigured(msg: string): boolean {
  return msg.includes('not enabled') || msg.includes('missing environment variable');
}

function friendlyAuthError(raw: string, view: View): string {
  const msg = raw.toLowerCase();

  // Ours, thrown from convex/passwordReset.ts. Named first because
  // "TooManyResetRequests" would otherwise be caught by the generic
  // too-many-attempts line below.
  if (msg.includes('toomanyresetrequests')) {
    return 'Too many codes have gone to that address already. Wait a few minutes and try again.';
  }
  if (msg.includes('resetemailfailed')) {
    return 'The code could not be sent just now. Try again in a moment.';
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Could not reach the server — check your connection and try again.';
  }
  if (msg.includes('too many')) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (misconfigured(msg)) {
    return 'Password reset is not switched on for this deployment yet.';
  }

  if (view === 'verify') {
    // Everything that can still go wrong here is the same thing to the person
    // typing: the eight digits did not work. Convex Auth deliberately does not
    // say which of wrong, expired or already-used it was.
    return 'That code is wrong, used or expired. Send yourself a new one.';
  }
  if (view === 'forgot') {
    return 'The code could not be sent just now. Try again in a moment.';
  }

  if (msg.includes('invalidsecret') || msg.includes('invalid password') || msg.includes('invalidaccountid')) {
    return view === 'signup'
      ? 'An account with this email already exists — try signing in.'
      : 'Wrong email or password. If you\'re new here, switch to sign up.';
  }
  if (msg.includes('account already exists')) {
    return 'An account with this email already exists — try signing in.';
  }
  if (msg.includes('password') && (msg.includes('short') || msg.includes('length') || msg.includes('validation'))) {
    return 'Password must be at least 8 characters.';
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

/** Long enough that the button is not a way to send mail in a loop, short
 *  enough that someone whose code genuinely never arrived is not stuck. */
const RESEND_COOLDOWN_S = 45;

function AuthContent() {
  const searchParams = useSearchParams();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (searchParams.get('mode') === 'signup') setView('signup');
  }, [searchParams]);

  // Already signed in → straight to the app
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, authLoading]);

  // The resend clock. One timeout per tick rather than an interval, so a
  // re-render mid-count cannot leave two of them running.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  /** Say it where the user is looking. role="alert" announces it, but a
   *  sighted keyboard user still has to be taken to it. */
  const showError = (message: string) => {
    setError(message);
    setLoading(false);
    requestAnimationFrame(() => {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: 'nearest' });
    });
  };

  const goTo = (next: View) => {
    setView(next);
    setError(null);
    setNotice(null);
  };

  /** Minimal profile info for UI display — the actual session is a
   *  server-verified Convex Auth token. */
  const rememberLocally = (displayName?: string) => {
    let existing = '';
    try {
      existing = JSON.parse(localStorage.getItem('second-brain-user') || '{}').name || '';
    } catch {
      // Nothing worth recovering; fall through to the email stem.
    }
    localStorage.setItem('second-brain-user', JSON.stringify({
      email,
      name: displayName || existing || email.split('@')[0],
    }));
    localStorage.removeItem('second-brain-demo');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const signup = view === 'signup';
    try {
      if (signup && password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }
      const params: Record<string, string> = {
        email,
        password,
        flow: signup ? 'signUp' : 'signIn',
      };
      if (signup) {
        params.name = name || email.split('@')[0];
      }
      await signIn('password', params);

      rememberLocally(signup ? (name || email.split('@')[0]) : undefined);
      if (signup) {
        localStorage.setItem('second-brain-new-user', 'true');
      }
      window.location.href = '/';
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Something went wrong';
      showError(raw.includes('Password must be') ? raw : friendlyAuthError(raw, view));
    }
  };

  /**
   * Ask for a code.
   *
   * An address with no vault behind it gets the same answer as one that has a
   * vault: Convex Auth throws `InvalidAccountId` and we swallow it. Anything
   * else would turn this form into a way to ask "is this person a user?", and
   * it is the one form on the site that anybody can post to.
   */
  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await signIn('password', { email, flow: 'reset' });
    } catch (err) {
      const raw = (err instanceof Error ? err.message : '').toLowerCase();
      const realFailure =
        raw.includes('toomanyresetrequests') ||
        raw.includes('resetemailfailed') ||
        raw.includes('fetch') ||
        raw.includes('network') ||
        misconfigured(raw);
      if (realFailure) {
        showError(friendlyAuthError(raw, 'forgot'));
        return;
      }
    }
    setLoading(false);
    setCode('');
    setCooldown(RESEND_COOLDOWN_S);
    setNotice(`If a vault is registered to ${email}, an eight-digit code is on its way. It expires in 15 minutes.`);
    setView('verify');
  };

  /** Redeem the code and set the new password. Convex Auth signs the browser
   *  in on the way through, and signs every other session out. */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const digits = code.replace(/\D/g, '');
      if (digits.length !== 8) {
        throw new Error('Enter the eight digits from the email.');
      }
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }
      await signIn('password', {
        email,
        code: digits,
        newPassword,
        flow: 'reset-verification',
      });

      rememberLocally();
      window.location.href = '/';
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Something went wrong';
      const ours = raw.startsWith('Enter the eight') || raw.startsWith('Password must be');
      showError(ours ? raw : friendlyAuthError(raw, 'verify'));
    }
  };

  const signup = view === 'signup';
  const resetting = view === 'forgot' || view === 'verify';
  const tagline = resetting ? 'Reset password' : signup ? 'Create a vault' : 'Sign in';

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
          <span className="auth-tagline">{tagline}</span>
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
          {!resetting && (
            <div className="auth-switch" role="group" aria-label="Sign in or create an account">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-on={view === m}
                  aria-pressed={view === m}
                  onClick={() => goTo(m)}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          <h2>
            {view === 'forgot' ? 'Reset your password'
              : view === 'verify' ? 'Check your email'
                : signup ? 'Create your vault' : 'Welcome back'}
          </h2>
          <p className="blurb">
            {view === 'forgot'
              ? 'Give us the address on the vault and we\'ll send an eight-digit code to it.'
              : view === 'verify'
                ? 'Enter the code with the new password you want. This signs you in here, and out of every other device.'
                : signup
                  ? 'Free while in beta — no card. Everything syncs, so your vault follows you between devices.'
                  : 'Sign in to your notes, your reading and your canvas.'}
          </p>

          {notice && (
            <div className="auth-note" role="status">
              <MailCheck size={15} strokeWidth={2} aria-hidden />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div className="auth-error" role="alert" ref={errorRef} tabIndex={-1}>
              <CircleAlert size={15} strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}

          {/* ---------- Ask for a code ------------------------------------ */}
          {view === 'forgot' && (
            <>
              <form onSubmit={requestCode}>
                <label className="auth-label" htmlFor="au-reset-email">
                  <span className="lbl">Email</span>
                  <input
                    id="au-reset-email"
                    className="auth-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    autoComplete="email"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </label>

                <button type="submit" className="auth-submit" disabled={loading}>
                  Send reset code
                  {loading
                    ? <Loader2 size={16} className="sb-spin" aria-hidden />
                    : <ArrowRight size={16} aria-hidden />}
                </button>
              </form>

              <p className="auth-foot">
                Remembered it?{' '}
                <button type="button" onClick={() => goTo('signin')}>Back to sign in</button>
              </p>
            </>
          )}

          {/* ---------- Spend the code ------------------------------------ */}
          {view === 'verify' && (
            <>
              <form onSubmit={handleReset}>
                <label className="auth-label" htmlFor="au-code">
                  <span className="lbl">Code from the email</span>
                  <input
                    id="au-code"
                    className="auth-input auth-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="1234 5678"
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={11}
                    spellCheck={false}
                  />
                </label>

                <label className="auth-label" htmlFor="au-newpw">
                  <span className="lbl">New password</span>
                  <span className="auth-pw">
                    <input
                      id="au-newpw"
                      className="auth-input"
                      type={showPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      autoComplete="new-password"
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
                  Set new password
                  {loading
                    ? <Loader2 size={16} className="sb-spin" aria-hidden />
                    : <ArrowRight size={16} aria-hidden />}
                </button>
              </form>

              <p className="auth-foot">
                Nothing arrived?{' '}
                <button type="button" onClick={() => requestCode()} disabled={loading || cooldown > 0}>
                  {cooldown > 0 ? `Send another in ${cooldown}s` : 'Send another code'}
                </button>
                <br />
                <button type="button" onClick={() => goTo('forgot')}>Use a different address</button>
              </p>
            </>
          )}

          {/* ---------- Sign in / sign up --------------------------------- */}
          {!resetting && (
            <>
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
                  <span className="lbl lbl-row">
                    Password
                    {!signup && (
                      <button type="button" className="auth-aside" onClick={() => goTo('forgot')}>
                        Forgot password?
                      </button>
                    )}
                  </span>
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
                      <button type="button" onClick={() => goTo('signup')}>
                        Create a vault
                      </button>
                    </>
                  )}
              </p>
            </>
          )}
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
