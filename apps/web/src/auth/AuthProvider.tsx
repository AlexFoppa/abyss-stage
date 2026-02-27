// src/auth/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setOn401 } from "../api";

export type Role = "GM" | "PLAYER";
export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  must_reset_password: boolean;
};

type ViewMode = "GM" | "PLAYER";
type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<User | null>;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
};



const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {

  const VIEW_MODE_KEY = "gm_view_mode";

  function readPersistedViewMode(): "GM" | "PLAYER" {
    const raw = (localStorage.getItem(VIEW_MODE_KEY) || "").toUpperCase();
    return raw === "GM" ? "GM" : "PLAYER";
  }

  const [user, setUser] = useState<User | null>(null);
    const [viewModeState, setViewModeState] = useState<"GM" | "PLAYER">(() => {
    try {
      return readPersistedViewMode();
    } catch {
      return "PLAYER";
    }
  });

  const [loading, setLoading] = useState(true);

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
      await api("/api/lobby/me", { method: "DELETE" });
    } catch {
      // ignora (pode já estar deslogado ou não estar no lobby)
    }
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }

  function setViewMode(mode: "GM" | "PLAYER") {
    // Se não for GM logado, ignora e força PLAYER
    if (!user || user.role !== "GM") {
      try {
        localStorage.removeItem(VIEW_MODE_KEY);
      } catch {}
      setViewModeState("PLAYER");
      return;
    }

    const next = mode === "GM" ? "GM" : "PLAYER";
    setViewModeState(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {}
  }


  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setOn401(() => setUser(null));
    return () => setOn401(null);
  }, []);

  const value = useMemo<AuthCtx>(() => {
    const effectiveViewMode: "GM" | "PLAYER" =
      user?.role === "GM" ? viewModeState : "PLAYER";

    return {
      user,
      loading,
      login,
      logout,
      refreshMe,
      viewMode: effectiveViewMode,
      setViewMode,
    };
  }, [user, loading, viewModeState]);


  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
