"use client";

/**
 * App-wide state:
 *  - which branch the browser is talking to (Campus / Bus Park / Airport)
 *  - the logged-in user and their token
 *
 * A login token works at every branch, because user accounts are copied to all branches
 * and all branches share the same JWT secret.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "./api";
import { BRANCHES, type Branch, branchById } from "./branches";
import type { LoginResponse, User } from "./types";

interface AppState {
  branch: Branch;
  setBranchId: (id: string) => void;
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  /** Call the API of the CURRENT branch (adds the login token automatically). */
  api: <T>(path: string, opts?: Parameters<typeof apiFetch>[2]) => Promise<T>;
}

const AppContext = createContext<AppState | null>(null);

const BRANCH_KEY = "lostfinder.branch";
const AUTH_KEY = "lostfinder.auth";

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or storage blocked: the app still works for this visit */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [branch, setBranch] = useState<Branch>(BRANCHES[0]);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Restore the chosen branch and login from the last visit
  useEffect(() => {
    const savedBranch = branchById(readStorage<string>(BRANCH_KEY));
    const current = savedBranch ?? BRANCHES[0];
    setBranch(current);
    const saved = readStorage<{ token: string; user: User }>(AUTH_KEY);
    if (!saved) {
      setReady(true);
      return;
    }
    setToken(saved.token);
    setUser(saved.user);
    setReady(true);
    // Check the token is still valid (it expires after a few hours)
    apiFetch<User>(current.url, "/auth/me", { token: saved.token })
      .then((u) => setUser(u))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          setUser(null);
          writeStorage(AUTH_KEY, null);
        }
      });
  }, []);

  const setBranchId = useCallback((id: string) => {
    const b = branchById(id);
    if (!b) return;
    setBranch(b);
    writeStorage(BRANCH_KEY, b.id);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const form = new URLSearchParams({ username: email, password });
      const res = await apiFetch<LoginResponse>(branch.url, "/auth/login", { method: "POST", form });
      setToken(res.access_token);
      setUser(res.user);
      writeStorage(AUTH_KEY, { token: res.access_token, user: res.user });
      return res.user;
    },
    [branch.url],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    writeStorage(AUTH_KEY, null);
  }, []);

  const api = useCallback(
    <T,>(path: string, opts: Parameters<typeof apiFetch>[2] = {}) =>
      apiFetch<T>(branch.url, path, { token, ...opts }),
    [branch.url, token],
  );

  const value = useMemo(
    () => ({ branch, setBranchId, user, token, ready, login, logout, api }),
    [branch, setBranchId, user, token, ready, login, logout, api],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Can this user edit the item? (reporter, staff of the item's home branch, or admin) */
export function canEdit(user: User | null, item: { reported_by: string | null; home_branch: string }): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "staff" && user.branch_id === item.home_branch) return true;
  return item.reported_by === user.id;
}

export function isStaffFor(user: User | null, homeBranch: string): boolean {
  return !!user && (user.role === "admin" || (user.role === "staff" && user.branch_id === homeBranch));
}
