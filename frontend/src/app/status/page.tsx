"use client";

import { Activity, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Clock, Database, HeartPulse, ImageIcon, Inbox, RadioTower, Server, Users, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/charts";
import { Hero, PageTitle } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { BRANCHES } from "@/lib/branches";
import type { ClusterView, Health, ReplicationStatus } from "@/lib/types";

interface BranchState {
  online: boolean;
  ms: number | null;
  health: Health | null;
  repl: ReplicationStatus | null;
  cluster: ClusterView | null;
}

const REFRESH_MS = 3000;

export default function StatusPage() {
  const { branch } = useApp();
  const [states, setStates] = useState<Record<string, BranchState> | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const entries = await Promise.all(
        BRANCHES.map(async (b) => {
          const start = performance.now();
          try {
            const [health, repl, cluster] = await Promise.all([
              apiFetch<Health>(b.url, "/health", { timeoutMs: 2500 }),
              apiFetch<ReplicationStatus>(b.url, "/replication/status", { timeoutMs: 2500 }),
              apiFetch<ClusterView>(b.url, "/cluster", { timeoutMs: 2500 }).catch(() => null),
            ]);
            return [b.id, { online: true, ms: Math.round(performance.now() - start), health, repl, cluster }] as const;
          } catch {
            return [b.id, { online: false, ms: null, health: null, repl: null, cluster: null }] as const;
          }
        }),
      );
      if (!cancelled) {
        setStates(Object.fromEntries(entries));
        setUpdated(new Date());
      }
    }
    poll();
    const t = setInterval(poll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Are all online branches holding the same number of items from each home branch?
  const online = states ? BRANCHES.filter((b) => states[b.id]?.online) : [];
  const signature = (id: string) => JSON.stringify(Object.entries(states?.[id]?.repl?.items_by_home_branch ?? {}).sort());
  const inSync = online.length > 1 && online.every((b) => signature(b.id) === signature(online[0].id));

  return (
    <>
      <PageTitle crumbs={[{ label: "Network status" }]} />
      <Hero tone="teal" icon={Activity} title="Network status"
        subtitle="Live view of every branch: its heartbeat, its connection to RabbitMQ, and its copy of the data."
        badges={<span className="chip bg-black/25 text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Live · updated {updated ? updated.toLocaleTimeString() : "…"}
        </span>} />

      {states && (
        <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${inSync ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-300"}`}>
          {inSync ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <Activity className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />}
          <p>
            {inSync
              ? <><b>All online branches are in sync.</b> Each one holds the same items from every home branch.</>
              : online.length <= 1
                ? <><b>{online.length === 0 ? "No branch is reachable." : "Only one branch is reachable."}</b> Start the others to compare their copies.</>
                : <><b>Branches are catching up.</b> Some copies differ right now; events are on their way through RabbitMQ.</>}
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {BRANCHES.map((b) => {
          const s = states?.[b.id];
          const r = s?.repl;
          return (
            <div key={b.id} className={`card overflow-hidden ${b.id === branch.id ? "ring-2 ring-blue-500" : ""}`}>
              <div className={`flex items-center justify-between px-5 py-4 ${!s ? "bg-panel-2" : s.online ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-md ${!s ? "bg-line text-ink-2" : s.online ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    <Server className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-xs text-ink-2">Branch {b.id} · {b.url.replace("http://", "")}</p>
                  </div>
                </div>
                <span className={`chip ${!s ? "bg-line text-ink-2" : s.online ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                  {!s ? "Checking" : s.online ? `Online · ${s.ms} ms` : "Offline"}
                </span>
              </div>

              <div className="space-y-3 p-5 text-sm">
                <Row Icon={Database} label="Database" ok={s?.online ? s.health?.database === "ok" : undefined} />
                <Row Icon={ArrowUpFromLine} label="Publishing to RabbitMQ" ok={r ? r.publisher_connected : undefined} />
                <Row Icon={ArrowDownToLine} label="Receiving from RabbitMQ" ok={r ? r.consumer_connected : undefined} />
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink-2"><ImageIcon className="h-4 w-4 text-ink-3" /> Photo storage</span>
                  <span className="text-xs font-semibold capitalize text-ink">{s?.health?.photo_storage ?? "–"}</span>
                </div>

                {/* Phase 5: what this branch's heartbeat monitor sees */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-ink-2"><HeartPulse className="h-4 w-4 text-ink-3" /> Sees</span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {s?.cluster?.peers.map((p) => (
                      <span key={p.branch} title={`${p.name}: ${p.status}${p.latency_ms != null ? `, ${p.latency_ms} ms` : ""}`}
                        className={`chip ${p.status === "up" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : p.status === "down" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-panel-2 text-ink-2"}`}>
                        {p.name} {p.status === "up" ? "up" : p.status === "down" ? "down" : "?"}
                      </span>
                    )) ?? <span className="text-xs text-ink-3">–</span>}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2">
                  <Stat Icon={RadioTower} label="Sent" value={r?.events_sent} />
                  <Stat Icon={Inbox} label="Received" value={r?.events_received} />
                  <Stat Icon={Activity} label="Outbox" value={r?.outbox_pending} warn={!!r && r.outbox_pending > 0} />
                  <Stat Icon={Clock} label="Queued" value={r?.queued_claims} warn={!!r && (r.queued_claims ?? 0) > 0} />
                </div>

                <div className="pt-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Items held, by home branch</p>
                  {BRANCHES.map((home) => {
                    const n = r?.items_by_home_branch?.[home.id] ?? 0;
                    const max = Math.max(1, ...Object.values(r?.items_by_home_branch ?? { x: 1 }));
                    return (
                      <div key={home.id} className="mb-1.5 flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-ink-2">{home.name}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
                          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${s?.online ? (n / max) * 100 : 0}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs font-semibold tabular-nums text-ink">{s?.online ? n : "–"}</span>
                      </div>
                    );
                  })}
                </div>

                <p className="flex items-center gap-1.5 pt-1 text-xs text-ink-2">
                  <Users className="h-3.5 w-3.5" /> {s?.online ? `${r?.users ?? 0} user accounts · ${r?.websocket_clients ?? 0} live connection${r?.websocket_clients === 1 ? "" : "s"}` : "Unknown"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mt-6">
        <div className="card-header"><Database className="h-4 w-4 text-brand" /> Each branch&apos;s copy of the data</div>
        <div className="p-4">
          <p className="mb-3 text-sm text-ink-2">Items each branch holds, grouped by the branch where they were reported. When the system is in sync, the bars for every branch are the same length.</p>
          <BarChart empty="No branch is reachable."
            labels={online.map((b) => `${b.name} holds`)}
            series={BRANCHES.map((home, i) => ({
              name: `Reported at ${home.name}`,
              color: `var(--series-${i + 1})`,
              values: online.map((b) => states?.[b.id]?.repl?.items_by_home_branch?.[home.id] ?? 0),
            }))} />
        </div>
      </div>

      <div className="mt-6 card p-6 text-sm text-ink-2">
        <h2 className="font-semibold text-ink">Try it during the demo</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Stop a branch: <code className="rounded bg-panel-2 px-1.5 py-0.5 text-xs">docker compose stop branch-c</code>. Its card turns red within seconds.</li>
          <li>Report a few items at another branch. The other branches update; &quot;Waiting&quot; stays 0.</li>
          <li>Start it again: <code className="rounded bg-panel-2 px-1.5 py-0.5 text-xs">docker compose start branch-c</code>. It catches up and the banner turns green.</li>
          <li>Stop RabbitMQ instead and report an item: &quot;Outbox&quot; goes up, then drops to 0 when RabbitMQ is back.</li>
          <li>Stop Bus Park, then claim one of its items from Campus: the claim is <b>queued</b> (&quot;Queued&quot; goes up). Start Bus Park and it is delivered automatically.</li>
        </ol>
      </div>
    </>
  );
}

function Row({ Icon, label, ok }: { Icon: typeof Database; label: string; ok: boolean | undefined }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ink-2"><Icon className="h-4 w-4 text-ink-3" /> {label}</span>
      {ok === undefined ? (
        <span className="text-xs text-ink-3">–</span>
      ) : ok ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> OK</span>
      ) : (
        <span className="flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300"><XCircle className="h-4 w-4" /> Down</span>
      )}
    </div>
  );
}

function Stat({ Icon, label, value, warn = false }: { Icon: typeof Activity; label: string; value: number | undefined; warn?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${warn ? "border-amber-500/30 bg-amber-500/10" : "border-line bg-panel-2"}`}>
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-3"><Icon className="h-3 w-3" /> {label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${warn ? "text-amber-700 dark:text-amber-300" : "text-ink"}`}>{value ?? "–"}</p>
    </div>
  );
}
