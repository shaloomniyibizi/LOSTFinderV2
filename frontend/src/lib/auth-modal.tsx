"use client";

/**
 * Sign in / Create account as a pop-up window over the current page.
 *   const { openAuth } = useAuthModal();
 *   openAuth("login")                       // stay on this page after signing in
 *   openAuth("register", "/report?type=LOST") // go there after signing up
 */
import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import BranchSwitcher from "@/components/BranchSwitcher";
import Logo from "@/components/layout/Logo";
import { Alert, Spinner } from "@/components/ui";
import { isOffline } from "./api";
import { useApp } from "./app-context";

export type AuthMode = "login" | "register";

interface AuthModalState {
  openAuth: (mode: AuthMode, next?: string) => void;
  closeAuth: () => void;
}
const Ctx = createContext<AuthModalState | null>(null);

function safeNext(next: string | undefined | null): string | undefined {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [next, setNext] = useState<string | undefined>();
  const openAuth = useCallback((m: AuthMode, n?: string) => {
    setMode(m);
    setNext(safeNext(n));
  }, []);
  const closeAuth = useCallback(() => setMode(null), []);
  return (
    <Ctx.Provider value={{ openAuth, closeAuth }}>
      {children}
      {mode && <AuthModal mode={mode} setMode={setMode} next={next} onClose={closeAuth} />}
    </Ctx.Provider>
  );
}

export function useAuthModal(): AuthModalState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuthModal must be used inside <AuthModalProvider>");
  return ctx;
}

function AuthModal({ mode, setMode, next, onClose }: { mode: AuthMode; setMode: (m: AuthMode) => void; next?: string; onClose: () => void }) {
  const { api, login, branch } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  // Escape closes; the page behind doesn't scroll; focus goes into the dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  useEffect(() => {
    setError(null);
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [mode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await api("/auth/register", { method: "POST", json: { ...form, phone: form.phone || null } });
      }
      await login(form.email, form.password);
      onClose();
      // After signing in: go where we were asked to, stay on a content page, or open the dashboard
      if (next) router.push(next);
      else if (["/", "/login", "/register"].includes(pathname)) router.push("/dashboard");
    } catch (err) {
      setError(isOffline(err) ? `${branch.name} branch is not reachable. Choose another branch above.` : (err as Error).message);
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="auth-title"
        className="card my-8 w-full max-w-md overflow-hidden shadow-2xl animate-[pop_.15s_ease-out]">
        <div className="relative bg-gradient-to-r from-[#162a5b] to-[#2f6ae0] px-6 pb-5 pt-6 text-white">
          <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5"><Logo size={34} /> <span className="text-lg font-semibold">LostFinder</span></div>
          <h2 id="auth-title" className="mt-4 text-2xl font-bold">{isLogin ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1 text-sm text-white/80">
            {isLogin ? "Your account works at every branch." : "Report lost and found items at any branch. It's free."}
          </p>
        </div>

        <div className="grid grid-cols-2 border-b border-line text-sm font-medium" role="tablist">
          {(["login", "register"] as AuthMode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`border-b-2 py-3 transition ${mode === m ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>
              {m === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <div className="flex items-center justify-between rounded-md bg-panel-2 px-3 py-1.5 text-sm text-ink-2">
            <span>Connecting to</span>
            <BranchSwitcher />
          </div>
          {!isLogin && (
            <div>
              <label className="label" htmlFor="auth-name">Full name</label>
              <input id="auth-name" required minLength={2} autoComplete="name" className="input" value={form.full_name} onChange={set("full_name")} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" required autoComplete="email" className="input" value={form.email} onChange={set("email")} />
          </div>
          {!isLogin && (
            <div>
              <label className="label" htmlFor="auth-phone">Phone <span className="font-normal text-ink-3">(optional)</span></label>
              <input id="auth-phone" type="tel" autoComplete="tel" className="input" placeholder="+250 7…" value={form.phone} onChange={set("phone")} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" required minLength={isLogin ? 1 : 6} maxLength={72}
              autoComplete={isLogin ? "current-password" : "new-password"} className="input" value={form.password} onChange={set("password")} />
            {!isLogin && <p className="mt-1.5 text-xs text-ink-3">At least 6 characters.</p>}
          </div>
          {error && <Alert>{error}</Alert>}
          <button className="btn-primary w-full py-2.5" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : isLogin ? "Sign in" : "Create account"}
          </button>
          <p className="text-center text-sm text-ink-2">
            {isLogin ? "New here? " : "Already have an account? "}
            <button type="button" onClick={() => setMode(isLogin ? "register" : "login")} className="font-semibold text-brand hover:underline">
              {isLogin ? "Create an account" : "Sign in"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
