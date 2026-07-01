'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useConvexAuth, useAuthActions } from '@convex-dev/auth/react';
import { Brain, ArrowRight, Sparkles } from 'lucide-react';

function AuthContent() {
  const searchParams = useSearchParams();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (searchParams.get('mode') === 'signup') setMode('signup');
  }, [searchParams]);

  // If already authenticated, redirect to home
  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      // Store minimal info for UI display (auth token is in httpOnly cookie)
      try {
        const userStr = localStorage.getItem('second-brain-user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (mode === 'signup' && !localStorage.getItem('second-brain-new-user')) {
            localStorage.setItem('second-brain-new-user', 'true');
          }
        }
      } catch {}
      window.location.href = '/';
    }
  }, [isAuthenticated, authLoading, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Use Convex Auth's signIn with the Password provider
      const signInParams: Record<string, any> = {
        email,
        password,
        flow: mode === 'signup' ? 'signUp' : 'signIn',
      };
      if (mode === 'signup') {
        signInParams.name = name || email.split('@')[0];
      }
      const result = await signIn('password', signInParams);

      if (!result) {
        throw new Error('Authentication failed');
      }

      // Store minimal info in localStorage (just for UI display — actual auth
      // is handled by Convex Auth session token, which is httpOnly and secure)
      localStorage.setItem('second-brain-user', JSON.stringify({
        email,
        name: name || email.split('@')[0],
      }));

      if (mode === 'signup') {
        localStorage.setItem('second-brain-new-user', 'true');
      }

      // Redirect happens automatically via the isAuthenticated effect above
      // But also force redirect as fallback
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(
        msg.includes('Invalid') || msg.includes('credentials')
          ? 'Invalid email or password'
          : msg.includes('already')
            ? 'An account with this email already exists'
            : msg
      );
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0c0c0e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{
        position: 'absolute', top: '30%', left: '50%',
        transform: 'translate(-50%,-50%)', width: 600, height: 400,
        background: 'radial-gradient(ellipse, rgba(124,110,247,0.10) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        width: 400, maxWidth: '90vw',
        background: '#111113', border: '1px solid #333338', borderRadius: 10,
        padding: 36, position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 28, textDecoration: 'none' }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7, background: '#7c6ef7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 1px rgba(124,110,247,0.4), 0 0 16px rgba(124,110,247,0.18)',
          }}>
            <Brain size={16} color="#0c0c0e" strokeWidth={2.25} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f2' }}>Second Brain</span>
        </div>

        <div style={{ display: 'flex', gap: 2, background: '#1e1e21', borderRadius: 6, padding: 3, marginBottom: 24 }}>
          {(['signin', 'signup'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '8px 0', borderRadius: 4,
              background: mode === m ? '#111113' : 'transparent',
              border: 'none', color: mode === m ? '#f0f0f2' : '#444450',
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>{m === 'signin' ? 'sign in' : 'sign up'}</button>
          ))}
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f0f0f2', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          {mode === 'signup' ? 'create your vault' : 'welcome back'}
        </h1>
        <p style={{ fontSize: 12, color: '#444450', margin: '0 0 24px', lineHeight: 1.6 }}>
          {mode === 'signup'
            ? 'Start with an empty vault + starter templates. Your knowledge, connected.'
            : 'Sign in to access your notes, reading, and canvas.'}
        </p>

        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 5, padding: '8px 12px', marginBottom: 14,
            fontSize: 11, color: '#f87171', fontFamily: 'inherit',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'signup' && (
            <div>
              <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#444450', fontWeight: 600, marginBottom: 5, display: 'block' }}>name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="your name" required
                style={{ width: '100%', background: '#1e1e21', border: '1px solid #333338', borderRadius: 5, padding: '10px 12px', color: '#f0f0f2', fontSize: 13, fontFamily: 'inherit', outline: 'none', caretColor: '#b0a8fb' }} />
            </div>
          )}
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#444450', fontWeight: 600, marginBottom: 5, display: 'block' }}>email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
              style={{ width: '100%', background: '#1e1e21', border: '1px solid #333338', borderRadius: 5, padding: '10px 12px', color: '#f0f0f2', fontSize: 13, fontFamily: 'inherit', outline: 'none', caretColor: '#b0a8fb' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#444450', fontWeight: 600, marginBottom: 5, display: 'block' }}>password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8}
              style={{ width: '100%', background: '#1e1e21', border: '1px solid #333338', borderRadius: 5, padding: '10px 12px', color: '#f0f0f2', fontSize: 13, fontFamily: 'inherit', outline: 'none', caretColor: '#b0a8fb' }} />
          </div>
          <button type="submit" disabled={loading} style={{
            marginTop: 6, padding: '11px 0', background: loading ? '#1e1e21' : '#7c6ef7',
            color: loading ? '#444450' : '#fff', border: 'none', borderRadius: 5,
            fontSize: 13, fontFamily: 'inherit', cursor: loading ? 'wait' : 'pointer', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {loading ? 'please wait…' : (<>{mode === 'signup' ? 'create vault' : 'sign in'}<ArrowRight size={14} /></>)}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/demo" style={{ fontSize: 11, color: '#b0a8fb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={11} />or try the demo without signing up →
          </a>
        </div>
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <a href="/landing" style={{ fontSize: 10, color: '#444450', textDecoration: 'none' }}>← back to home</a>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0c0c0e' }} />}>
      <AuthContent />
    </Suspense>
  );
}
