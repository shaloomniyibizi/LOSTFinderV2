"use client";

import {
  Ban, CheckCircle2, Copy, KeyRound, Pencil, RefreshCw, Search, ShieldAlert, ShieldCheck, UserCheck, UserPlus, UserRound, Users, UsersRound,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { Avatar } from "@/components/layout/Topbar";
import RequireLogin from "@/components/RequireLogin";
import { Alert, EmptyState, Hero, PageTitle, PillTabs, Spinner, StatCard } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { BRANCHES, branchName } from "@/lib/branches";
import { formatDate } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import type { AdminUser, Role } from "@/lib/types";

export default function UsersPage() {
  return (
    <RequireLogin reason="User management is for administrators.">
      <UserManagement />
    </RequireLogin>
  );
}

type RoleFilter = Role | "all";
type StatusFilter = "all" | "active" | "disabled";
type Dialog = { kind: "create" } | { kind: "edit"; user: AdminUser } | { kind: "password"; user: AdminUser } | { kind: "toggle"; user: AdminUser } | null;

const ROLE_LOOK: Record<Role, { label: string; cls: string }> = {
  user: { label: "Member", cls: "bg-panel-2 text-ink-2 ring-1 ring-line" },
  staff: { label: "Staff", cls: "bg-blue-600 text-white" },
  admin: { label: "Admin", cls: "bg-violet-600 text-white" },
};

function UserManagement() {
  const { api, user: me } = useApp();
  const { pushToast } = useNotifications();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(() => {
    api<AdminUser[]>("/users").then((u) => { setUsers(u); setError(null); }).catch((e) => setError((e as Error).message));
  }, [api]);
  useEffect(load, [load]);

  const done = (message: string) => {
    setDialog(null);
    pushToast({ kind: "info", title: "Saved", message });
    load();
  };

  const shown = useMemo(() => (users ?? []).filter((u) => {
    const text = `${u.full_name} ${u.email} ${u.phone ?? ""}`.toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (role === "all" || u.role === role)
      && (status === "all" || (status === "active") === u.is_active);
  }), [users, q, role, status]);

  if (me?.role !== "admin") {
    return <div className="mx-auto max-w-xl py-10"><EmptyState icon={ShieldAlert} title="Admins only">Only an administrator can manage user accounts.</EmptyState></div>;
  }

  const all = users ?? [];
  const count = (r: Role) => all.filter((u) => u.role === r).length;
  const staffByBranch = BRANCHES.map((b) => `${b.name} ${all.filter((u) => u.role === "staff" && u.branch_id === b.id).length}`).join(" · ");

  return (
    <>
      <PageTitle crumbs={[{ label: "Administration" }, { label: "User management" }]} />
      <Hero tone="violet" icon={UsersRound} title="User management"
        subtitle="Accounts work at every branch. Changes made here are copied to Campus, Bus Park and Airport within a second."
        actions={<>
          <button onClick={load} className="btn-outline-light"><RefreshCw className="h-4 w-4" /> Refresh</button>
          <button onClick={() => setDialog({ kind: "create" })} className="btn-light"><UserPlus className="h-4 w-4" /> Add user</button>
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Users} tint="blue" label="All accounts" value={users ? all.length : "–"} />
        <StatCard icon={UserRound} tint="slate" label="Members" value={users ? count("user") : "–"} />
        <StatCard icon={ShieldCheck} tint="teal" label="Staff" value={users ? count("staff") : "–"} note={users ? staffByBranch : undefined} />
        <StatCard icon={UsersRound} tint="violet" label="Admins" value={users ? count("admin") : "–"} />
        <StatCard icon={Ban} tint="rose" label="Disabled" value={users ? all.filter((u) => !u.is_active).length : "–"} />
      </div>

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="flex flex-1">
            <span className="flex items-center rounded-l-md border border-r-0 border-line bg-panel-2 px-3 text-ink-2"><Search className="h-4 w-4" /></span>
            <input className="input rounded-l-none" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
          </div>
          <PillTabs value={role} onChange={setRole} tabs={[
            { value: "all", label: "All", count: all.length },
            { value: "user", label: "Members", count: count("user") },
            { value: "staff", label: "Staff", count: count("staff") },
            { value: "admin", label: "Admins", count: count("admin") },
          ]} />
          <select className="input lg:w-40" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        {error && <div className="p-4"><Alert>{error}</Alert></div>}
        {users === null && !error && <div className="flex justify-center py-16 text-ink-3"><Spinner /></div>}
        {users && shown.length === 0 && <EmptyState bare icon={Search}>No accounts match these filters.</EmptyState>}
        {users && shown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-line text-sm text-ink-2">
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Reports</th>
                  <th className="px-4 py-3 font-semibold">Claims</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} className={`hover:bg-panel-2 ${u.is_active ? "" : "opacity-60"}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name} size={36} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{u.full_name} {self && <span className="chip ml-1 bg-blue-500/15 text-brand">you</span>}</p>
                            <p className="truncate text-sm text-ink-3">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`chip ${ROLE_LOOK[u.role].cls}`}>{ROLE_LOOK[u.role].label}</span>
                        {u.role === "staff" && <p className="mt-1 text-sm text-ink-3">{branchName(u.branch_id)}</p>}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{u.reports}</td>
                      <td className="px-4 py-3 tabular-nums">{u.claims}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-2">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        {u.is_active
                          ? <span className="chip bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3" /> Active</span>
                          : <span className="chip bg-rose-600 text-white"><Ban className="h-3 w-3" /> Disabled</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setDialog({ kind: "edit", user: u })} className="btn-ghost px-2" title="Edit" aria-label={`Edit ${u.full_name}`}><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setDialog({ kind: "password", user: u })} className="btn-ghost px-2" title="Reset password" aria-label={`Reset password for ${u.full_name}`}><KeyRound className="h-4 w-4" /></button>
                          <button disabled={self} onClick={() => setDialog({ kind: "toggle", user: u })}
                            className={`btn-ghost px-2 ${u.is_active ? "hover:text-rose-500" : "hover:text-emerald-500"}`}
                            title={self ? "You can't disable your own account" : u.is_active ? "Disable" : "Enable"}
                            aria-label={`${u.is_active ? "Disable" : "Enable"} ${u.full_name}`}>
                            {u.is_active ? <Ban className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {users && <p className="border-t border-line px-4 py-2.5 text-sm text-ink-3">Showing {shown.length} of {all.length} accounts</p>}
      </div>

      {dialog?.kind === "create" && <UserForm onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "edit" && <UserForm user={dialog.user} self={dialog.user.id === me.id} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "password" && <PasswordReset user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "toggle" && <ToggleActive user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

function UserForm({ user, self = false, onClose, onDone }: { user?: AdminUser; self?: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const { api } = useApp();
  const [form, setForm] = useState({
    full_name: user?.full_name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", password: "",
    role: (user?.role ?? "user") as Role, branch_id: user?.branch_id ?? "A",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const branch_id = form.role === "staff" ? form.branch_id : null;
    try {
      if (user) {
        await api(`/users/${user.id}`, { method: "PATCH", json: { full_name: form.full_name, phone: form.phone || null, role: form.role, branch_id } });
        onDone(`${form.full_name}'s account was updated at every branch.`);
      } else {
        await api("/users", { method: "POST", json: { full_name: form.full_name, email: form.email, phone: form.phone || null, password: form.password, role: form.role, branch_id } });
        onDone(`${form.full_name} can now sign in at any branch.`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={user ? `Edit ${user.full_name}` : "Add a user"} subtitle={user ? user.email : "Create a member, staff or admin account."} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button form="user-form" className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : user ? "Save changes" : "Create account"}</button>
      </>}>
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="u-name">Full name</label>
            <input id="u-name" className="input" required minLength={2} value={form.full_name} onChange={set("full_name")} />
          </div>
          {!user && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="u-email">Email</label>
              <input id="u-email" type="email" className="input" required value={form.email} onChange={set("email")} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="u-phone">Phone <span className="font-normal text-ink-3">(optional)</span></label>
            <input id="u-phone" className="input" value={form.phone} onChange={set("phone")} placeholder="+250 7…" />
          </div>
          {!user && (
            <div>
              <label className="label" htmlFor="u-pass">Password</label>
              <input id="u-pass" type="text" className="input" required minLength={6} maxLength={72} value={form.password} onChange={set("password")} autoComplete="off" />
            </div>
          )}
        </div>
        <fieldset>
          <legend className="label">Role</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {([["user", "Member", "Reports and claims items"], ["staff", "Staff", "Checks claims at one branch"], ["admin", "Admin", "Everything, all branches"]] as [Role, string, string][]).map(([v, l, d]) => (
              <label key={v} className={`cursor-pointer rounded-md border p-3 transition ${form.role === v ? "border-brand bg-blue-500/10" : "border-line hover:bg-panel-2"} ${self && v !== "admin" ? "pointer-events-none opacity-50" : ""}`}>
                <input type="radio" name="role" value={v} checked={form.role === v} onChange={() => setForm({ ...form, role: v })} className="sr-only" disabled={self && v !== "admin"} />
                <span className="block text-sm font-semibold">{l}</span>
                <span className="block text-xs text-ink-3">{d}</span>
              </label>
            ))}
          </div>
          {self && <p className="mt-1.5 text-xs text-ink-3">You can&apos;t remove your own admin role.</p>}
        </fieldset>
        {form.role === "staff" && (
          <div>
            <label className="label" htmlFor="u-branch">Works at</label>
            <select id="u-branch" className="input" value={form.branch_id} onChange={set("branch_id")}>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name} (branch {b.id})</option>)}
            </select>
            <p className="mt-1 text-xs text-ink-3">Staff approve claims and hand over items for this branch.</p>
          </div>
        )}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

function randomPassword() {
  const words = ["blue", "lake", "kivu", "moon", "river", "hill", "rain", "sun", "drum", "tea"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(100 + Math.random() * 900)}`;
}

function PasswordReset({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (m: string) => void }) {
  const { api } = useApp();
  const [password, setPassword] = useState(randomPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/users/${user.id}/password`, { method: "POST", json: { password } });
      onDone(`New password set for ${user.full_name}. Give it to them in person.`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Reset password" subtitle={`${user.full_name} · ${user.email}`} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button form="pw-form" className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <><KeyRound className="h-4 w-4" /> Set new password</>}</button>
      </>}>
      <form id="pw-form" onSubmit={submit} className="space-y-3">
        <label className="label" htmlFor="pw">New password</label>
        <div className="flex gap-2">
          <input id="pw" className="input font-mono" required minLength={6} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          <button type="button" className="btn-secondary" onClick={() => setPassword(randomPassword())} title="Suggest another"><RefreshCw className="h-4 w-4" /></button>
          <button type="button" className="btn-secondary" title="Copy" onClick={() => navigator.clipboard?.writeText(password).then(() => setCopied(true)).catch(() => {})}>
            {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-sm text-ink-2">Their old password stops working at every branch. Ask them to change it from <b>My profile</b> after signing in.</p>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

function ToggleActive({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (m: string) => void }) {
  const { api } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabling = user.is_active;

  async function go() {
    setBusy(true);
    try {
      await api(`/users/${user.id}`, { method: "PATCH", json: { is_active: !disabling } });
      onDone(disabling ? `${user.full_name} can no longer sign in.` : `${user.full_name} can sign in again.`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={disabling ? `Disable ${user.full_name}?` : `Enable ${user.full_name}?`} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={go} data-autofocus className={disabling ? "btn-danger" : "btn-primary"} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : disabling ? <><Ban className="h-4 w-4" /> Disable account</> : <><UserCheck className="h-4 w-4" /> Enable account</>}
        </button>
      </>}>
      {disabling ? (
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>They can&apos;t sign in at any branch, and anyone already signed in as them is signed out.</li>
          <li>Their {user.reports} report{user.reports === 1 ? "" : "s"} and {user.claims} claim{user.claims === 1 ? "" : "s"} stay in the system.</li>
          <li>You can enable the account again at any time.</li>
        </ul>
      ) : (
        <p className="text-sm text-ink-2">{user.full_name} will be able to sign in again at every branch with their existing password.</p>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Modal>
  );
}
