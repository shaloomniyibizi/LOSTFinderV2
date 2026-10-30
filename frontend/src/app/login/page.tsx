"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import AuthCard from "@/components/AuthCard";
import { Alert, Spinner } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function LoginForm() {
  const { login, branch } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.push(next);
    } catch (err) {
      setError(isOffline(err) ? `${branch.name} branch is not reachable. Choose another branch at the top.` : (err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle={<>Log in at the <b className="text-slate-700">{branch.name}</b> branch. Your account works at every branch.</>}>
      {params.get("registered") && (
        <div className="mb-4"><Alert kind="success">Account created. You can log in now.</Alert></div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : "Log in"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        New here?{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-indigo-600 hover:text-indigo-700">Create an account</Link>
      </p>
    </AuthCard>
  );
}
