import React, { useState } from 'react';
import { Lock, LogIn, ShieldAlert } from 'lucide-react';
import { setClientSessionToken } from '../lib/security/clientSessionToken.ts';

export interface AuthGateModalProps {
  isOpen: boolean;
  authConfigured: boolean;
  accentColor: string;
  onAuthenticated: (username: string) => void;
}

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  isOpen,
  authConfigured,
  accentColor,
  onAuthenticated,
}) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Enter both username and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        authenticated?: boolean;
        username?: string;
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.authenticated) {
        setErrorMsg(data.error || `Sign-in failed (${res.status}).`);
        return;
      }
      if (data.token) {
        setClientSessionToken(data.token);
      }
      setPassword('');
      onAuthenticated(data.username || username.trim());
    } catch {
      setErrorMsg('Network error contacting authentication gateway.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="marrok-auth-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#080d11] shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl border border-white/15 bg-black/60 flex items-center justify-center shrink-0"
            style={{ color: accentColor }}
          >
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 id="marrok-auth-heading" className="text-base font-extrabold text-white tracking-tight">
              MARROK Studio Sign-In
            </h2>
            <p className="text-xs text-slate-400">
              Single-user session cookie authentication required for API & Vault access.
            </p>
          </div>
        </div>

        {!authConfigured && (
          <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <span>
              Server authentication secrets (<code className="font-mono">ADMIN_USERNAME</code>,{' '}
              <code className="font-mono">ADMIN_PASSWORD_HASH</code>,{' '}
              <code className="font-mono">SESSION_SECRET</code>) are not configured yet. API routes fail closed with HTTP 503.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label htmlFor="marrok-login-user" className="block text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Username
            </label>
            <input
              id="marrok-login-user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              placeholder="admin"
              className="w-full rounded-xl border border-white/15 bg-black/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="marrok-login-pass" className="block text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Password
            </label>
            <input
              id="marrok-login-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              placeholder="••••••••••••"
              className="w-full rounded-xl border border-white/15 bg-black/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-400"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !authConfigured}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold text-slate-950 transition-opacity disabled:opacity-45 cursor-pointer"
            style={{ backgroundColor: accentColor }}
          >
            <LogIn className="w-4 h-4" />
            <span>{isSubmitting ? 'Verifying Session...' : 'Sign In'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
