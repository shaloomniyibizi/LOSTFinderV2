"use client";

import { Building2, Calendar, LogOut, Mail, Monitor, Moon, Phone, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import BranchSwitcher from "@/components/BranchSwitcher";
import { Avatar } from "@/components/layout/Topbar";
import RequireLogin from "@/components/RequireLogin";
import { PageTitle, StatCard } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { useCounts } from "@/lib/counts";
import { formatDate } from "@/lib/format";
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
        <div className="card overflow-hidden">
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
          <div className="card">
            <div className="card-header"><UserRound className="h-4 w-4 text-brand" /> Account details</div>
            <Row icon={UserRound} label="Name">{user.full_name}</Row>
            <Row icon={Mail} label="Email">{user.email}</Row>
            <Row icon={Phone} label="Phone">{user.phone || <span className="text-ink-3">Not given</span>}</Row>
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
