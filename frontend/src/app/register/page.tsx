"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import AuthCard from "@/components/AuthCard";
import { Alert, Spinner } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const { api, login, branch } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/register", { method: "POST", json: { ...form, phone: form.phone || null } });
      await login(form.email, form.password);
      router.push(next);
    } catch (err) {
      setError(isOffline(err) ? `${branch.name} branch is not reachable. Choose another branch at the top.` : (err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="Report lost and found items at any branch.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" required minLength={2} autoComplete="name" className="input" value={form.full_name} onChange={set("full_name")} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="phone" type="tel" autoComplete="tel" className="input" placeholder="+250 7…" value={form.phone} onChange={set("phone")} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={6} maxLength={72} autoComplete="new-password" className="input" value={form.password} onChange={set("password")} />
          <p className="mt-1.5 text-xs text-slate-500">At least 6 characters.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : "Create account"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-indigo-600 hover:text-indigo-700">Log in</Link>
      </p>
    </AuthCard>
  );
}
