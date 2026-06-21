"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginScreen } from "@/components/LoginScreen";

type AuthState = "loading" | "anonymous" | "authenticated";

export const AuthGate = () => {
  const [status, setStatus] = useState<AuthState>("loading");
  const [user, setUser] = useState<User | null>(null);

  // On load, ask the backend who we are. The session cookie (if present and
  // valid) keeps us logged in across refreshes.
  useEffect(() => {
    api
      .me()
      .then((me) => {
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => setStatus("anonymous"));
  }, []);

  const handleLogin = useCallback(async (username: string, password: string) => {
    const me = await api.login(username, password);
    setUser(me);
    setStatus("authenticated");
  }, []);

  const handleLogout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  if (status === "loading") {
    return (
      <div
        data-testid="auth-loading"
        className="flex min-h-screen items-center justify-center text-sm font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]"
      >
        Loading...
      </div>
    );
  }

  if (status === "anonymous" || !user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <KanbanBoard user={user} onLogout={handleLogout} />;
};
