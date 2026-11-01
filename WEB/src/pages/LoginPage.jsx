import BrandMark from '../components/BrandMark';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Radio,
  MapPin,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// A Google OAuth *client id* is a public identifier - it is inlined into every
// browser bundle by design, and the security comes from the authorised-origin
// list in Google Cloud, not from keeping this value secret.
// The Cloudflare Pages variable wins when it is set and well formed. The
// fallback keeps sign-in working when the variable is missing, was saved after
// the build started, or was pasted truncated in the dashboard.
const FALLBACK_GOOGLE_CLIENT_ID =
  '66951276979-66l1j0kdakebc5hnjfjujb8ua2th125u.apps.googleusercontent.com';
const CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

const configuredClientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_ID = CLIENT_ID_PATTERN.test(configuredClientId)
  ? configuredClientId
  : FALLBACK_GOOGLE_CLIENT_ID;

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisPromise = null;

// Loads the Google Identity Services script once, no matter how often the page
// is re-rendered. Resolves false when the script cannot be fetched (offline).
function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve(true);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.google?.accounts?.id)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(Boolean(window.google?.accounts?.id));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return gisPromise;
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const googleButtonRef = useRef(null);

  const handleGoogleCredential = useCallback(async (response) => {
    if (!response?.credential) {
      setError('Google did not return a credential. Please try again.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await loginWithGoogle(response.credential);
    if (!result.success) setError(result.error);
    setBusy(false);
  }, [loginWithGoogle]);

  // Render the official Google button. It is the only button Google permits for
  // brand compliance, and it handles the account chooser for us.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    loadGoogleIdentityServices().then((ready) => {
      if (cancelled) return;
      if (!ready || !googleButtonRef.current) {
        setGoogleFailed(true);
        return;
      }
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 336
        });
        setGoogleReady(true);
      } catch (err) {
        console.warn('[auth] Google button could not be rendered', err);
        setGoogleFailed(true);
      }
    });

    return () => { cancelled = true; };
  }, [handleGoogleCredential]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await login(email.trim(), password);
    if (!result.success) setError(result.error || 'Unable to sign in');
    setBusy(false);
  };

  return (
    <div className="auth-page">
      {/* Brand / context panel */}
      <aside className="auth-brand">
        <div className="auth-brand-top">
          <div className="auth-logo">
            <BrandMark size={56} />
          </div>
          <div>
            <div className="auth-brand-title">SmartWater Zambia</div>
            <div className="auth-brand-sub">Smart Water Monitoring &amp; Climate Resilience</div>
          </div>
        </div>

        <div className="auth-brand-copy">
          <h1>Every tank, every drop, in real time.</h1>
          <p>
            Ultrasonic telemetry from Lusaka&apos;s reservoirs, community incident
            reports and drought response tools — in one shared platform for the
            utility team and the people it serves.
          </p>
          <ul className="auth-features">
            <li><Radio size={16} /> Live ESP32 water-level telemetry</li>
            <li><MapPin size={16} /> Community reports &amp; incident mapping</li>
            <li><ShieldCheck size={16} /> One account for web and Android</li>
            <li><Users size={16} /> Administrator and community roles</li>
          </ul>
        </div>

        <div className="auth-brand-footer">
          Lusaka, Zambia · Powered by the SmartWater shared API
        </div>
      </aside>

      {/* Form panel */}
      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>Sign in</h2>
            <p>Use your SmartWater account, or continue with Google.</p>
          </div>

          {error && (
            <div className="auth-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-field">
              <span>Email address</span>
              <div className="auth-input">
                <Mail size={16} />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="you@majismart.zm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input">
                <Lock size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? <Loader2 size={18} className="spin" /> : null}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <div className="auth-google">
            <div ref={googleButtonRef} className="auth-google-button" />
            {!googleReady && !googleFailed && (
              <p className="auth-google-note">Loading Google sign-in…</p>
            )}
            {googleFailed && (
              <p className="auth-google-note">
                Google sign-in could not load in this browser (a script blocker or
                offline connection will do it). Email and password still work.
              </p>
            )}
          </div>

          <p className="auth-footnote">
            Administrator and community accounts are issued by the SmartWater team.
            Google accounts are signed up as community members and can be upgraded
            by an administrator.
          </p>
        </div>

        <p className="auth-legal">
          SmartWater Zambia · Water security for Lusaka
        </p>
      </main>
    </div>
  );
}

