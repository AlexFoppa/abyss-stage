// src/auth/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";

export type Role = "GM" | "PLAYER";
export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  must_reset_password: boolean;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<User | null>;

  gmView: "GM" | "PLAYER";
  setViewMode: (mode: "GM" | "PLAYER") => void;
};


const Ctx = createContext<AuthCtx | null>(null);

const GM_VIEW_KEY = "gm_view_mode";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [gmView, setGmView] = useState<"GM" | "PLAYER">(() => {
    const v = localStorage.getItem(GM_VIEW_KEY);
    return v === "PLAYER" ? "PLAYER" : "GM";
  });

  async function refreshMe() {
    try {
      const me = await api<User>("/api/auth/me");
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const me = await api<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(me);
    return me;
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }

  function setViewMode(mode: "GM" | "PLAYER") {
    if (user?.role !== "GM") return;
    setGmView(mode);
    localStorage.setItem(GM_VIEW_KEY, mode);
  }

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ user, loading, login, logout, refreshMe, gmView, setViewMode }),
    [user, loading, gmView]
  );


  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
