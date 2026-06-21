"use client";

import { useState } from "react";

type LoginScreenProps = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export const LoginScreen = ({ onLogin }: LoginScreenProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <form
        onSubmit={handleSubmit}
        data-testid="login-form"
        className="relative w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/85 p-10 shadow-[var(--shadow)] backdrop-blur"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Single Board Kanban
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Sign in to Kanban Studio
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          Enter your credentials to open your board.
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--navy-dark)]">
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm font-normal text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--navy-dark)]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm font-normal text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
          </label>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-[var(--accent-yellow)] bg-[rgba(236,173,10,0.12)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)]"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-8 w-full rounded-2xl bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition disabled:opacity-60"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
};
