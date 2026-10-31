"use client";

import { Building2, Calendar, KeyRound, LogOut, Mail, Monitor, Moon, Pencil, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import BranchSwitcher from "@/components/BranchSwitcher";
import { Avatar } from "@/components/layout/Topbar";
import RequireLogin from "@/components/RequireLogin";
import { Alert, PageTitle, Spinner, StatCard } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { useCounts } from "@/lib/counts";
import { formatDate } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import type { User } from "@/lib/types";
import { type ThemeChoice, useTheme } from "@/lib/theme";

export default function ProfilePage() {
  return (
    <RequireLogin reason="Log in to see your profile.">
      <Profile />
    </RequireLogin>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-0">
      <Icon className="h-4 w-4 text-ink-3" />
      <span className="w-32 text-sm text-ink-2">{label}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

function Profile() {
  const { user, logout, branch } = useApp();
  const { me } = useCounts();
  const { choice, setChoice } = useTheme();
  const router = useRouter();
  if (!user) return null;
  const role = user.role === "admin" ? "Administrator (all branches)" : user.role === "staff" ? `Staff at ${branchName(user.branch_id)}` : "Member";

  return (
    <>
      <PageTitle title="My profile" crumbs={[{ label: "My profile" }]} />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="card self-start overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-[#162a5b] to-[#2f6ae0]" />
          <div className="-mt-10 flex flex-col items-center px-5 pb-6 text-center">
            <Avatar name={user.full_name} size={80} />
            <h2 className="mt-3 text-xl font-bold">{user.full_name}</h2>
            <p className="text-ink-2">{user.email}</p>
            <span className="chip mt-2 bg-blue-500/15 text-brand"><ShieldCheck className="h-3.5 w-3.5" /> {role}</span>
            <button onClick={() => { logout(); router.push("/"); }} className="btn-secondary mt-5 w-full text-rose-600 dark:text-rose-400">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={UserRound} tint="blue" label="Reports made" value={me?.reports ?? "–"} href="/my-items" />
            <StatCard icon={ShieldCheck} tint="green" label="Items returned to me" value={me?.returned_to_me ?? "–"} href="/claims" />
            <StatCard icon={Building2} tint="amber" label="Items I turned in" value={me?.found_waiting ?? "–"} href="/my-items" />
          </div>
          <div className="grid gap-6 2xl:grid-cols-2">
            <EditProfile />
            <ChangePassword />
          </div>
          <div className="card">
            <div className="card-header"><UserRound className="h-4 w-4 text-brand" /> Account details</div>
            <Row icon={Mail} label="Email">{user.email}</Row>
            <Row icon={ShieldCheck} label="Role">{role}</Row>
            <Row icon={Calendar} label="Member since">{formatDate(user.created_at)}</Row>
          </div>
          <div className="card">
            <div className="card-header"><Monitor className="h-4 w-4 text-brand" /> Preferences</div>
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
              <span className="w-32 text-sm text-ink-2">Connected branch</span>
              <BranchSwitcher />
              <span className="text-sm text-ink-3">Your account works at every branch; {branch.name} is the one this browser uses.</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="w-32 text-sm text-ink-2">Theme</span>
              <div className="inline-flex rounded-md border border-line p-0.5">
                {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "Auto", Monitor]] as [ThemeChoice, string, typeof Sun][]).map(([v, l, Icon]) => (
                  <button key={v} onClick={() => setChoice(v)} aria-pressed={choice === v}
                    className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${choice === v ? "bg-brand-strong text-white" : "text-ink-2 hover:text-ink"}`}>
                    <Icon className="h-4 w-4" /> {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function EditProfile() {
  const { user, api, updateUser } = useApp();
  const { pushToast } = useNotifications();
  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = name !== user?.full_name || phone !== (user?.phone ?? "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      updateUser(await api<User>("/auth/me", { method: "PATCH", json: { full_name: name, phone: phone || null } }));
      pushToast({ kind: "info", title: "Profile saved", message: "Your details were updated at every branch." });
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="card-header"><Pencil className="h-4 w-4 text-brand" /> Edit profile</div>
      <div className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="p-name">Full name</label>
          <input id="p-name" className="input" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="p-phone">Phone <span className="font-normal text-ink-3">(staff use it to contact you about claims)</span></label>
          <input id="p-phone" className="input" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 7…" />
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary" disabled={busy || !changed}>{busy ? <Spinner className="h-4 w-4" /> : "Save changes"}</button>
      </div>
    </form>
  );
}

function ChangePassword() {
  const { api } = useApp();
  const { pushToast } = useNotifications();
  const [form, setForm] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.next !== form.again) {
      setError("The two new passwords are not the same.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/auth/me/password", { method: "POST", json: { current_password: form.current, new_password: form.next } });
      setForm({ current: "", next: "", again: "" });
      pushToast({ kind: "info", title: "Password changed", message: "Use your new password at any branch from now on." });
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="card-header"><KeyRound className="h-4 w-4 text-brand" /> Change password</div>
      <div className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="pw-cur">Current password</label>
          <input id="pw-cur" type="password" className="input" required autoComplete="current-password" value={form.current} onChange={set("current")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pw-new">New password</label>
            <input id="pw-new" type="password" className="input" required minLength={6} maxLength={72} autoComplete="new-password" value={form.next} onChange={set("next")} />
          </div>
          <div>
            <label className="label" htmlFor="pw-again">New password again</label>
            <input id="pw-again" type="password" className="input" required minLength={6} maxLength={72} autoComplete="new-password" value={form.again} onChange={set("again")} />
          </div>
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : "Change password"}</button>
      </div>
    </form>
  );
}
