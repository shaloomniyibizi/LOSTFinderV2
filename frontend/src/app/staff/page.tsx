"use client";

import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ClaimCard from "@/components/ClaimCard";
import RequireLogin from "@/components/RequireLogin";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { useNotifications } from "@/lib/notifications";
import type { Claim } from "@/lib/types";

type Tab = "pending" | "collect" | "done";

export default function StaffPage() {
  return (
    <RequireLogin reason="The staff desk is for branch staff.">
      <StaffDesk />
    </RequireLogin>
  );
}

function StaffDesk() {
  const { api, user, branch } = useApp();
  const { liveVersion } = useNotifications();
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const isStaff = user?.role === "staff" || user?.role === "admin";

  const load = useCallback(() => {
    if (!isStaff) return;
    setError(null);
    api<Claim[]>("/claims")
      .then(setClaims)
      .catch((err) => {
        setError(isOffline(err) ? `${branch.name} branch is not reachable. Try another branch.` : (err as Error).message);
        setClaims([]);
      });
  }, [api, isStaff, branch.name]);

  useEffect(load, [load, liveVersion]);

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState icon={ShieldAlert} title="Staff only">
          This page is for branch staff. An admin can give your account the staff role.
        </EmptyState>
      </div>
    );
  }

  const groups: Record<Tab, Claim[]> = {
    pending: claims?.filter((c) => c.status === "PENDING") ?? [],
    collect: claims?.filter((c) => c.status === "APPROVED" && !c.handed_over_at) ?? [],
    done: claims?.filter((c) => c.status === "REJECTED" || !!c.handed_over_at) ?? [],
  };
  const tabs: [Tab, string][] = [
    ["pending", "To verify"],
    ["collect", "Waiting for collection"],
    ["done", "Closed"],
  ];
  const replace = (c: Claim) => setClaims((all) => all?.map((x) => (x.id === c.id ? c : x)) ?? null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Staff desk"
        subtitle={user?.role === "admin" ? "All branches' claims (admin view)." : `Claims on items held by the ${branchName(user?.branch_id)} branch.`}
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900"}`}>
            {label}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${tab === key ? "bg-white/20" : "bg-slate-100"}`}>{groups[key].length}</span>
          </button>
        ))}
      </div>

      {error && <div className="mt-6"><Alert>{error}</Alert></div>}

      <div className="mt-6 space-y-4">
        {claims === null && <p className="text-sm text-slate-500">Loading…</p>}
        {claims && groups[tab].length === 0 && (
          <EmptyState icon={ClipboardCheck} title={tab === "pending" ? "No claims to verify" : "Nothing here"}>
            {tab === "pending" ? "New claims appear here instantly." : ""}
          </EmptyState>
        )}
        {groups[tab].map((c) => <ClaimCard key={c.id} claim={c} staffView showItem onChanged={replace} />)}
      </div>
    </div>
  );
}
