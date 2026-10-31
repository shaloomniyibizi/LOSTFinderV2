"use client";

import {
  BadgeCheck, Bell, Boxes, CheckCircle2, CircleDot, ClipboardCheck, Clock, Gauge, Hourglass, Link2, List,
  Network, Package, PackageCheck, Percent, RefreshCcw, Search, Send, ShieldCheck, Smile, SquarePlus, Undo2, Users, XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart, LineChart } from "@/components/charts";
import RequireLogin from "@/components/RequireLogin";
import {
  Alert, CardTabs, EmptyState, Hero, IconTile, PageTitle, StatCard, TimelineItem, ViewAll, type Tint,
} from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { BRANCHES, branchName } from "@/lib/branches";
import { useCounts } from "@/lib/counts";
import { capitalize, greeting, shortDay, timeAgo, waitingFor } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import type { Claim, Item, ItemPage, MyMatch, Overview } from "@/lib/types";
import { useBranchHealth } from "@/lib/use-branch-health";
import { useOverview } from "@/lib/use-overview";

export default function DashboardPage() {
  return (
    <RequireLogin reason="Log in to see your dashboard.">
      <Dashboard />
    </RequireLogin>
  );
}

function Dashboard() {
  const { user } = useApp();
  const { data, error, updatedAt } = useOverview();
  const isStaff = user?.role === "staff" || user?.role === "admin";
  return (
    <>
      <PageTitle title={isStaff ? "Security Desk Dashboard" : "My Dashboard"} crumbs={[{ label: "Overview" }]} />
      <Greeting updatedAt={updatedAt} staff={isStaff} />
      {error && !data && <div className="mb-5"><Alert>{error}</Alert></div>}
      {isStaff ? <StaffDashboard data={data} /> : <UserDashboard data={data} />}
    </>
  );
}

function Greeting({ updatedAt, staff }: { updatedAt: Date | null; staff: boolean }) {
  const { user } = useApp();
  const { connected } = useNotifications();
  if (!user) return null;
  const role = user.role === "admin" ? "Administrator" : user.role === "staff" ? `Security staff · ${branchName(user.branch_id)}` : "Member";
  return (
    <Hero
      title={`${greeting()}, ${user.full_name.split(" ")[0]}`}
      subtitle={staff ? "Claims, custody and returns across all three branches, at a glance." : "Here's where your items stand today."}
      badges={<>
        <span className="chip bg-white text-slate-900"><BadgeCheck className="h-3.5 w-3.5" /> {role}</span>
        <span className="chip bg-black/25 text-white">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-slate-400"}`} />
          {connected ? "Live" : "Reconnecting"}{updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ""}
        </span>
      </>}
      actions={staff ? <>
        <Link href="/staff?tab=pending" className="btn-light"><ShieldCheck className="h-4 w-4" /> Review queue</Link>
        <Link href="/staff?tab=collect" className="btn-outline-light"><PackageCheck className="h-4 w-4" /> Awaiting handover</Link>
        <Link href="/found" className="btn-outline-light"><Package className="h-4 w-4" /> Found items</Link>
      </> : <>
        <Link href="/report?type=LOST" className="btn-warning"><Search className="h-4 w-4" /> Report lost item</Link>
        <Link href="/report?type=FOUND" className="btn-light"><SquarePlus className="h-4 w-4" /> Turn in found item</Link>
        <Link href="/matches" className="btn-outline-light"><Link2 className="h-4 w-4" /> My matches</Link>
      </>}
    />
  );
}

/* ------------------------------------------------------------------ shared cards */

function TrendCard({ data }: { data: Overview | null }) {
  const diff = data ? data.last_7_days - data.previous_7_days : 0;
  return (
    <div className="card lg:col-span-2">
      <div className="card-header justify-between">
        <span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-brand" /> Network reports · last 14 days</span>
        {data && (
          <span className="flex items-center gap-2 text-sm font-normal text-ink-2">
            <b className="text-ink">{data.last_7_days}</b> in the last 7 days
            <span className={`chip ${diff >= 0 ? "bg-white text-slate-900" : "bg-rose-500/15 text-rose-600 dark:text-rose-300"}`}>
              {diff >= 0 ? "+" : ""}{diff} vs previous 7 days
            </span>
          </span>
        )}
      </div>
      <div className="p-4">
        {data ? (
          <LineChart
            labels={data.days.map((d) => shortDay(d.date))}
            series={[
              { name: "Lost", color: "var(--series-1)", values: data.days.map((d) => d.lost) },
              { name: "Found", color: "var(--series-2)", values: data.days.map((d) => d.found) },
            ]}
          />
        ) : <div className="h-60 animate-pulse rounded bg-panel-2" />}
      </div>
    </div>
  );
}

function GlanceCard({ rows }: { rows: { icon: LucideIcon; tint: Tint; label: string; value: ReactNode; href?: string }[] }) {
  return (
    <div className="card">
      <div className="card-header"><Gauge className="h-4 w-4 text-brand" /> At a glance</div>
      <ul>
        {rows.map((r) => {
          const inner = (
            <>
              <IconTile icon={r.icon} tint={r.tint} size="sm" />
              <span className="flex-1">{r.label}</span>
              <b className="text-lg tabular-nums">{r.value}</b>
            </>
          );
          return (
            <li key={r.label} className="border-b border-line last:border-0">
              {r.href
                ? <Link href={r.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-panel-2">{inner}</Link>
                : <div className="flex items-center gap-3 px-4 py-3.5">{inner}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CategoryCard({ data }: { data: Overview | null }) {
  const rows = data?.by_category.slice(0, 8) ?? [];
  return (
    <div className="card">
      <div className="card-header"><List className="h-4 w-4 text-brand" /> Reports by category</div>
      <div className="p-4">
        {data ? <BarChart labels={rows.map((r) => capitalize(r.category))}
          series={[{ name: "Reports", color: "var(--series-1)", values: rows.map((r) => r.count) }]} />
          : <div className="h-48 animate-pulse rounded bg-panel-2" />}
      </div>
    </div>
  );
}

function Table({ head, children, empty }: { head: string[]; children: ReactNode[]; empty: ReactNode }) {
  if (!children.length) return <div className="py-6">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[0.95rem]">
        <thead><tr className="border-b border-line">{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

function StatusPill({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`chip whitespace-nowrap ${cls}`}>{children}</span>;
}
const CLAIM_PILL = {
  PENDING: { label: "Submitted", cls: "bg-amber-400 text-slate-900" },
  APPROVED: { label: "Approved", cls: "bg-emerald-600 text-white" },
  REJECTED: { label: "Not accepted", cls: "bg-rose-600 text-white" },
  COLLECTED: { label: "Collected", cls: "bg-blue-600 text-white" },
};
function claimPill(c: Claim) {
  return CLAIM_PILL[c.handed_over_at ? "COLLECTED" : c.status];
}
const ITEM_PILL: Record<Item["status"], { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "bg-white text-slate-900 ring-1 ring-line" },
  MATCHED: { label: "Possible match", cls: "bg-amber-400 text-slate-900" },
  CLAIMED: { label: "Claim approved", cls: "bg-blue-600 text-white" },
  RETURNED: { label: "Returned", cls: "bg-emerald-600 text-white" },
};

function RecentReports({ items }: { items: Item[] | null }) {
  return (
    <Table head={["Item", "Type", "Branch", "Reported", "Status"]} empty={<EmptyState bare icon={Boxes}>No reports yet.</EmptyState>}>
      {(items ?? []).map((i) => (
        <tr key={i.id} className="hover:bg-panel-2">
          <td className="px-4 py-3"><Link href={`/items/${i.id}`} className="hover:text-brand">{i.title}</Link></td>
          <td className="px-4 py-3"><StatusPill cls={i.type === "LOST" ? "bg-rose-600 text-white" : "bg-blue-600 text-white"}>{i.type === "LOST" ? "Lost" : "Found"}</StatusPill></td>
          <td className="px-4 py-3 text-ink-2">{branchName(i.home_branch)}</td>
          <td className="px-4 py-3 text-ink-2">{timeAgo(i.created_at)}</td>
          <td className="px-4 py-3"><StatusPill cls={ITEM_PILL[i.status].cls}>{ITEM_PILL[i.status].label}</StatusPill></td>
        </tr>
      ))}
    </Table>
  );
}

/* ------------------------------------------------------------------ member dashboard */

function UserDashboard({ data }: { data: Overview | null }) {
  const { api } = useApp();
  const { me } = useCounts();
  const { activity, unread, liveVersion } = useNotifications();
  const [tab, setTab] = useState<"matches" | "claims" | "reports">("matches");
  const [matches, setMatches] = useState<MyMatch[] | null>(null);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [mine, setMine] = useState<Item[] | null>(null);

  useEffect(() => {
    api<MyMatch[]>("/me/matches").then(setMatches).catch(() => setMatches([]));
    api<Claim[]>("/claims/mine").then(setClaims).catch(() => setClaims([]));
    api<ItemPage>("/items/mine").then((p) => setMine(p.items)).catch(() => setMine([]));
  }, [api, liveVersion]);

  const openMatches = (matches ?? []).filter((m) => {
    const own = m.side === "LOST" ? m.lost : m.found;
    return own.status === "OPEN" || own.status === "MATCHED";
  });
  const status = me?.lost_by_status;

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Search} tint="rose" label="My open lost reports" value={me?.open_lost ?? "–"} note="Still being searched for" href="/my-items" />
        <StatCard icon={Link2} tint="amber" label="Matches to review" value={me?.matches ?? "–"} note="Possible matches for your items" href="/matches" />
        <StatCard icon={ClipboardCheck} tint="blue" label="My active claims" value={me?.active_claims ?? "–"} note="Submitted or approved" href="/claims" />
        <StatCard icon={Package} tint="green" label="Items I turned in" value={me?.found_waiting ?? "–"} note="Waiting for their owners" href="/my-items" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <TrendCard data={data} />
        <GlanceCard rows={[
          { icon: Smile, tint: "green", label: "My items returned", value: me?.returned_to_me ?? 0, href: "/my-items" },
          { icon: PackageCheck, tint: "blue", label: "Ready to collect", value: me?.ready_to_collect ?? 0, href: "/claims" },
          { icon: ShieldCheck, tint: "teal", label: "Found items in custody", value: data?.totals.found_in_custody ?? "–", href: "/found" },
          { icon: Bell, tint: "slate", label: "Unread notifications", value: unread, href: "/notifications" },
        ]} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <CardTabs value={tab} onChange={setTab} tabs={[
            { value: "matches", label: "Matches awaiting you", icon: Link2, count: openMatches.length },
            { value: "claims", label: "My claims", icon: ClipboardCheck, count: claims?.length, countCls: "bg-ink-3/40 text-ink" },
            { value: "reports", label: "My recent reports", icon: List },
          ]} />
          {tab === "matches" && (
            <Table head={["Your item", "Possible match", "Score", ""]} empty={<EmptyState bare icon={Link2}>No possible matches yet. We check every new report, at every branch.</EmptyState>}>
              {openMatches.slice(0, 6).map((m) => {
                const own = m.side === "LOST" ? m.lost : m.found;
                const other = m.side === "LOST" ? m.found : m.lost;
                return (
                  <tr key={m.id} className="hover:bg-panel-2">
                    <td className="px-4 py-3">{own.title}</td>
                    <td className="px-4 py-3">
                      <Link href={`/items/${other.id}`} className="text-brand underline-offset-2 hover:underline">{other.title}</Link>
                      <p className="text-sm text-ink-3">{other.location || branchName(other.home_branch)}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{m.score}%</td>
                    <td className="px-4 py-3 text-right"><Link href={`/items/${other.id}`} className="btn-primary px-3 py-1.5">Review</Link></td>
                  </tr>
                );
              })}
            </Table>
          )}
          {tab === "claims" && (
            <Table head={["Item", "Submitted", "Status", ""]} empty={<EmptyState bare icon={ClipboardCheck}>You haven&apos;t claimed anything.</EmptyState>}>
              {(claims ?? []).slice(0, 6).map((c) => (
                <tr key={c.id} className="hover:bg-panel-2">
                  <td className="px-4 py-3">{c.item_title ?? "Item"}</td>
                  <td className="px-4 py-3 text-ink-2">{timeAgo(c.created_at)}</td>
                  <td className="px-4 py-3"><StatusPill cls={claimPill(c).cls}>{claimPill(c).label}</StatusPill></td>
                  <td className="px-4 py-3 text-right"><Link href={`/items/${c.item_id}`} className="btn-secondary px-3 py-1.5">Open</Link></td>
                </tr>
              ))}
            </Table>
          )}
          {tab === "reports" && <RecentReports items={mine?.slice(0, 6) ?? null} />}
          <div className="border-t border-line px-4 py-2.5 text-right">
            <ViewAll href={tab === "matches" ? "/matches" : tab === "claims" ? "/claims" : "/my-items"}>
              {tab === "matches" ? "All my matches" : tab === "claims" ? "All my claims" : "All my reports"}
            </ViewAll>
          </div>
        </div>

        <div className="card flex flex-col">
          <div className="card-header"><Clock className="h-4 w-4 text-brand" /> Your recent notifications</div>
          <ul className="max-h-[26rem] flex-1 overflow-y-auto p-4">
            {activity.length === 0 && <EmptyState bare icon={Bell}>Nothing yet. You&apos;ll be told here when an item matches yours.</EmptyState>}
            {activity.slice(0, 6).map((a, i, all) => (
              <TimelineItem key={`${a.at}-${i}`} last={i === all.length - 1} time={timeAgo(a.at)} title={a.title} href={a.link}
                icon={a.kind === "match" ? Link2 : a.kind === "claim" ? ClipboardCheck : Bell}
                iconCls={a.kind === "match" ? "bg-amber-400 text-slate-900" : "bg-emerald-600 text-white"}>
                {a.message}
              </TimelineItem>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-header"><Search className="h-4 w-4 text-brand" /> My lost reports by status</div>
          <div className="p-4">
            <BarChart empty="You haven't reported anything lost."
              labels={["Open", "Possible match found", "Claim approved", "Returned to me"]}
              series={[{ name: "Reports", color: "var(--series-1)", values: status ? [status.OPEN, status.MATCHED, status.CLAIMED, status.RETURNED] : [] }]} />
          </div>
        </div>
        <CategoryCard data={data} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ staff / admin dashboard */

type Decision = { at: string; claim: Claim; kind: "submitted" | "approved" | "rejected" | "collected" };

function StaffDashboard({ data }: { data: Overview | null }) {
  const { api, user } = useApp();
  const { staffClaims, staffPending, staffCollect } = useCounts();
  const { liveVersion } = useNotifications();
  const [tab, setTab] = useState<"queue" | "collect" | "recent">("queue");
  const [recent, setRecent] = useState<Item[] | null>(null);
  const t = data?.totals;

  useEffect(() => {
    api<ItemPage>("/items?limit=8").then((p) => setRecent(p.items)).catch(() => setRecent([]));
  }, [api, liveVersion]);

  const decisions = useMemo<Decision[]>(() => {
    const out: Decision[] = [];
    for (const c of staffClaims ?? []) {
      out.push({ at: c.created_at, claim: c, kind: "submitted" });
      if (c.decided_at) out.push({ at: c.decided_at, claim: c, kind: c.status === "REJECTED" ? "rejected" : "approved" });
      if (c.handed_over_at) out.push({ at: c.handed_over_at, claim: c, kind: "collected" });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  }, [staffClaims]);

  const pending = (staffClaims ?? []).filter((c) => c.status === "PENDING");
  const collect = (staffClaims ?? []).filter((c) => c.status === "APPROVED" && !c.handed_over_at);
  const stage = data?.claims_by_stage;
  const scope = user?.role === "admin" ? "all branches" : `${branchName(user?.branch_id)} branch`;

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardCheck} tint="amber" label="Claims to review" value={staffPending} note={`Submitted · ${scope}`} href="/staff?tab=pending" />
        <StatCard icon={PackageCheck} tint="blue" label="Awaiting handover" value={staffCollect} note="Approved, not yet collected" href="/staff?tab=collect" />
        <StatCard icon={ShieldCheck} tint="teal" label="Items in custody" value={t?.found_in_custody ?? "–"} note="Found items held, all branches" href="/found" />
        <StatCard icon={RefreshCcw} tint="green" label="Returned (30 days)" value={t?.returned_30_days ?? "–"} note="Completed handovers" href="/staff?tab=done" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <TrendCard data={data} />
        <GlanceCard rows={[
          { icon: Search, tint: "rose", label: "Open lost reports", value: t?.open_lost ?? "–", href: "/lost" },
          { icon: Link2, tint: "amber", label: "Pending match suggestions", value: t?.pending_matches ?? "–" },
          { icon: Percent, tint: "green", label: "Return rate (found items)", value: t ? `${t.return_rate}%` : "–" },
          { icon: Hourglass, tint: "violet", label: "Avg. claim to handover", value: t?.avg_hours_to_handover != null ? `${t.avg_hours_to_handover} h` : "–" },
          ...(user?.role === "admin" ? [{ icon: Users, tint: "blue" as Tint, label: "Registered users", value: t?.users ?? "–", href: "/admin/users" }] : []),
        ]} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-col lg:col-span-2">
          <CardTabs value={tab} onChange={setTab} tabs={[
            { value: "queue", label: "Claim queue", icon: ClipboardCheck, count: pending.length },
            { value: "collect", label: "Awaiting handover", icon: PackageCheck, count: collect.length, countCls: "bg-blue-600 text-white" },
            { value: "recent", label: "Recent reports", icon: List },
          ]} />
          <div className="flex-1">
            {tab === "queue" && (
              <Table head={["Item", "Claimant", "Waiting", "Status", ""]} empty={<EmptyState bare icon={CheckCircle2}>No claims waiting. New claims appear here instantly.</EmptyState>}>
                {pending.slice(0, 6).map((c) => (
                  <tr key={c.id} className="hover:bg-panel-2">
                    <td className="px-4 py-3">{c.item_title ?? "Item"}<p className="text-sm text-ink-3">{branchName(c.home_branch)}</p></td>
                    <td className="px-4 py-3 text-ink-2">{c.claimant_email ?? c.claimant_name}</td>
                    <td className="px-4 py-3 text-ink-2">{waitingFor(c.created_at)}</td>
                    <td className="px-4 py-3"><StatusPill cls={CLAIM_PILL.PENDING.cls}>Submitted</StatusPill></td>
                    <td className="px-4 py-3 text-right"><Link href="/staff?tab=pending" className="btn-primary px-3 py-1.5">Review</Link></td>
                  </tr>
                ))}
              </Table>
            )}
            {tab === "collect" && (
              <Table head={["Item", "Owner", "Approved", ""]} empty={<EmptyState bare icon={PackageCheck}>Nothing waiting to be collected.</EmptyState>}>
                {collect.slice(0, 6).map((c) => (
                  <tr key={c.id} className="hover:bg-panel-2">
                    <td className="px-4 py-3">{c.item_title ?? "Item"}</td>
                    <td className="px-4 py-3 text-ink-2">{c.claimant_name}<p className="text-sm text-ink-3">{c.claimant_phone ?? c.claimant_email}</p></td>
                    <td className="px-4 py-3 text-ink-2">{c.decided_at ? timeAgo(c.decided_at) : "–"}</td>
                    <td className="px-4 py-3 text-right"><Link href="/staff?tab=collect" className="btn-primary px-3 py-1.5">Hand over</Link></td>
                  </tr>
                ))}
              </Table>
            )}
            {tab === "recent" && <RecentReports items={recent} />}
          </div>
          <div className="border-t border-line px-4 py-2.5 text-right">
            <ViewAll href={tab === "recent" ? "/lost" : `/staff?tab=${tab === "queue" ? "pending" : "collect"}`}>
              {tab === "recent" ? "Browse all reports" : "Open the full queue"}
            </ViewAll>
          </div>
        </div>

        <div className="card flex flex-col">
          <div className="card-header"><Clock className="h-4 w-4 text-brand" /> Recent claim activity</div>
          <ul className="max-h-[26rem] flex-1 overflow-y-auto p-4">
            {decisions.length === 0 && <EmptyState bare icon={ClipboardCheck}>No claims yet.</EmptyState>}
            {decisions.map((d, i) => {
              const look = {
                submitted: { icon: Send, cls: "bg-ink-3 text-white", verb: "submitted" },
                approved: { icon: CheckCircle2, cls: "bg-emerald-600 text-white", verb: "approved" },
                rejected: { icon: XCircle, cls: "bg-rose-600 text-white", verb: "rejected" },
                collected: { icon: Undo2, cls: "bg-blue-600 text-white", verb: "handed over" },
              }[d.kind];
              return (
                <TimelineItem key={`${d.claim.id}-${d.kind}`} last={i === decisions.length - 1} icon={look.icon} iconCls={look.cls}
                  time={timeAgo(d.at)} title={`Claim ${look.verb}`} href={`/items/${d.claim.item_id}`}>
                  {d.claim.item_title} · {d.claim.claimant_email ?? d.claim.claimant_name}
                </TimelineItem>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-header"><ClipboardCheck className="h-4 w-4 text-brand" /> Claims by status <span className="ml-auto text-xs font-normal text-ink-3">all branches</span></div>
          <div className="p-4">
            <BarChart empty="No claims yet."
              labels={["Submitted", "Approved", "Collected", "Not accepted"]}
              series={[{ name: "Claims", color: "var(--series-1)", values: stage ? [stage.PENDING, stage.APPROVED, stage.COLLECTED, stage.REJECTED] : [] }]} />
          </div>
        </div>
        <CategoryCard data={data} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="card-header"><Network className="h-4 w-4 text-brand" /> Reports by home branch</div>
          <div className="p-4">
            <BarChart
              labels={(data?.by_branch ?? []).map((b) => branchName(b.branch))}
              series={[
                { name: "Lost", color: "var(--series-1)", values: (data?.by_branch ?? []).map((b) => b.lost) },
                { name: "Found", color: "var(--series-2)", values: (data?.by_branch ?? []).map((b) => b.found) },
              ]} />
          </div>
        </div>
        <NetworkCard data={data} />
      </div>
    </>
  );
}

function NetworkCard({ data }: { data: Overview | null }) {
  const health = useBranchHealth();
  const { branch } = useApp();
  return (
    <div className="card">
      <div className="card-header"><Network className="h-4 w-4 text-brand" /> Branch network</div>
      <ul>
        {BRANCHES.map((b) => {
          const h = health?.[b.id];
          const held = data?.by_branch.find((x) => x.branch === b.id);
          return (
            <li key={b.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className={`h-2.5 w-2.5 rounded-full ${!h ? "bg-ink-3" : h.online ? "bg-emerald-500" : "bg-rose-500"}`} />
              <div className="flex-1">
                <p className="font-medium">{b.name} {b.id === branch.id && <span className="chip ml-1 bg-blue-500/15 text-brand">you</span>}</p>
                <p className="text-sm text-ink-3">{h ? (h.online ? `Online · ${h.ms} ms` : "Offline") : "Checking…"}</p>
              </div>
              <span className="text-right text-sm text-ink-2"><b className="text-ink">{held ? held.lost + held.found : 0}</b> reports</span>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line px-4 py-2.5 text-right"><ViewAll href="/status">Network status</ViewAll></div>
    </div>
  );
}

// Keep tree-shaking honest about icons only used in maps
void CircleDot;
