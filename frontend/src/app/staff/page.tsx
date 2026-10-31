"use client";

import { ClipboardCheck, PackageCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import ClaimCard from "@/components/ClaimCard";
import RequireLogin from "@/components/RequireLogin";
import { Alert, CardTabs, EmptyState, Hero, PageTitle } from "@/components/ui";
import { useCounts } from "@/lib/counts";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { useNotifications } from "@/lib/notifications";
import type { Claim } from "@/lib/types";

type Tab = "pending" | "collect" | "done";

export default function StaffPage() {
  return (
    <RequireLogin reason="The staff desk is for branch staff.">
      <Suspense fallback={null}><StaffDesk /></Suspense>
    </RequireLogin>
  );
}

function StaffDesk() {
  const { api, user, branch } = useApp();
  const { liveVersion } = useNotifications();
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = (["pending", "collect", "done"] as Tab[]).includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "pending";
  const setTab = (t: Tab) => router.replace(`/staff?tab=${t}`);
  const counts = useCounts();
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
      <div className="mx-auto max-w-xl py-10">
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
  const replace = (c: Claim) => {
    setClaims((all) => all?.map((x) => (x.id === c.id ? c : x)) ?? null);
    counts.refresh();
  };
  const scope = user?.role === "admin" ? "All branches (admin view)" : `Items held by the ${branchName(user?.branch_id)} branch`;

  return (
    <>
      <PageTitle crumbs={[{ label: "Security desk" }, { label: tab === "pending" ? "Review queue" : tab === "collect" ? "Awaiting handover" : "Closed" }]} />
      <Hero tone="blue" icon={ShieldCheck} title="Security desk"
        subtitle={`${scope}. Check each claimant's answer against the item before approving; hand items over only with an ID.`} />
      <div className="card">
        <CardTabs value={tab} onChange={setTab} tabs={[
          { value: "pending", label: "Review queue", icon: ClipboardCheck, count: groups.pending.length, countCls: "bg-rose-600 text-white" },
          { value: "collect", label: "Awaiting handover", icon: PackageCheck, count: groups.collect.length, countCls: "bg-blue-600 text-white" },
          { value: "done", label: "Closed", count: groups.done.length, countCls: "bg-ink-3/40 text-ink" },
        ]} />
        <div className="p-4">
          {error && <div className="mb-4"><Alert>{error}</Alert></div>}
          {claims === null && <p className="text-sm text-ink-2">Loading…</p>}
          {claims && groups[tab].length === 0 && (
            <EmptyState bare icon={ClipboardCheck} title={tab === "pending" ? "No claims to verify" : "Nothing here"}>
              {tab === "pending" ? "New claims appear here instantly." : ""}
            </EmptyState>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {groups[tab].map((c) => <ClaimCard key={c.id} claim={c} staffView showItem onChanged={replace} />)}
          </div>
        </div>
      </div>
    </>
  );
}
