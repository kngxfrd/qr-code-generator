import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../app/auth';
import { useToast } from '../app/toast';
import { Button, Field } from '../components/ui';
import type { User } from '../types';

function GoogleButton() {
  return <a className="google-button" href="/auth/google"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.88c-.58 2.96-2.26 5.48-4.75 7.18l7.62 5.91c4.45-4.1 7.23-10.14 7.23-17.56z"/><path fill="#FBBC05" d="M10.53 28.59A14.37 14.37 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.92 23.92 0 0 0 0 24c0 3.86.92 7.51 2.53 10.78l8-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.12 1.42-4.84 2.27-8.28 2.27-6.26 0-11.57-4.22-13.47-9.91l-8 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Continue with Google</a>;
}

export function AuthPage({ mode }: { mode: 'signup' | 'signin' }) {
  const signup = mode === 'signup';
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { setUser } = useAuth();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationMode, setVerificationMode] = useState(false);
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      if (verificationMode) {
        const result = await api<{ user: User }>('/api/auth/verify-email', { method: 'POST', body: { email, code: verificationCode } });
        setUser(result.user);
        notify('Your email is verified. Welcome to Free QR Generator!');
      } else {
        const result = await api<{ user?: User; verificationRequired?: boolean }>(`/api/auth/${signup ? 'signup' : 'signin'}`, { method: 'POST', body: signup ? { name, email, password } : { email, password } });
        if (result.verificationRequired) {
          setVerificationMode(true);
          notify('We sent a 6-digit verification code to your email.');
          return;
        }
        if (!result.user) throw new Error('Could not complete sign in. Please try again.');
        setUser(result.user);
        notify(signup ? 'Your workspace is ready.' : 'Welcome back. A sign-in notification was sent to your email.');
      }
      navigate(search.get('return') === 'builder' ? '/?resume=1' : '/qr-codes');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not sign in.';
      setError(message);
      if (!signup && message.toLowerCase().includes('verify your email')) setVerificationMode(true);
    }
    finally { setLoading(false); }
  };
  const resendCode = async () => {
    if (!email) return setError('Enter your email address first.');
    setError(''); setResending(true);
    try { await api('/api/auth/verify-email/resend', { method: 'POST', body: { email } }); notify('If your account needs verification, a fresh code has been sent.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resend the code.'); }
    finally { setResending(false); }
  };
  return <div className="auth-page"><section className="auth-card"><div className="auth-card-brand"><span className="brand-mark"><Mail size={21} /></span><span>{verificationMode ? 'One quick check.' : signup ? 'A place for your codes.' : 'Good to see you again.'}</span></div><p className="eyebrow">FREE QR GENERATOR</p><h1>{verificationMode ? 'Verify your email' : signup ? 'Create your account' : 'Sign in to your workspace'}</h1><p className="auth-copy">{verificationMode ? `Enter the 6-digit code we sent to ${email}. The code expires in 10 minutes.` : signup ? 'Save your QR codes and keep your designs together.' : 'Your saved QR codes are waiting for you.'}</p>
    {!verificationMode && <><GoogleButton /><div className="auth-divider"><span>or use your email</span></div></>}{error && <div className="form-alert" role="alert">{error}</div>}
    <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>{!verificationMode && signup && <Field label="Your name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} />}{<Field label="Email address" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={verificationMode} />}{verificationMode ? <Field label="6-digit verification code" name="verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required /> : <Field label="Password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={signup ? 10 : 1} hint={signup ? 'At least 10 characters.' : undefined} />}<Button type="submit" loading={loading} disabled={verificationMode && verificationCode.length !== 6}>{verificationMode ? 'Verify email' : signup ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></Button></form>
    {verificationMode ? <div className="auth-switch"><button className="text-button" type="button" onClick={() => void resendCode()} disabled={resending}>{resending ? 'Sending…' : 'Resend verification code'}</button> · <button className="text-button" type="button" onClick={() => { setVerificationMode(false); setVerificationCode(''); setError(''); }}>Back</button></div> : <p className="auth-switch">{signup ? 'Already have an account?' : 'New to Free QR Generator?'} <Link to={signup ? '/signin' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link></p>}<p className="auth-terms">By continuing, you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>
  </section><aside className="auth-aside"><div className="auth-aside-art"><div className="auth-qr-demo"><QrCodeIcon /></div><span className="demo-caption">READY WHEN YOU ARE</span></div><p>Make a code worth scanning.</p><span>Design it here. Keep it in your workspace. Print it when it’s ready.</span></aside></div>;
}

function QrCodeIcon() { return <div className="qr-symbol"><i /><i /><i /><i /><b /></div>; }
