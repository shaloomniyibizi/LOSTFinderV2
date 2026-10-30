"use client";

import { Activity, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Database, ImageIcon, Inbox, RadioTower, Server, Users, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { BRANCHES } from "@/lib/branches";
import type { Health, ReplicationStatus } from "@/lib/types";

interface BranchState {
  online: boolean;
  ms: number | null;
  health: Health | null;
  repl: ReplicationStatus | null;
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
            const [health, repl] = await Promise.all([
              apiFetch<Health>(b.url, "/health", { timeoutMs: 2500 }),
              apiFetch<ReplicationStatus>(b.url, "/replication/status", { timeoutMs: 2500 }),
            ]);
            return [b.id, { online: true, ms: Math.round(performance.now() - start), health, repl }] as const;
          } catch {
            return [b.id, { online: false, ms: null, health: null, repl: null }] as const;
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
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Network status"
        subtitle="Live view of every branch: its heartbeat, its connection to RabbitMQ, and its copy of the data."
      >
        <span className="inline-flex items-center gap-2 text-sm text-slate-500">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Live · updated {updated ? updated.toLocaleTimeString() : "…"}
        </span>
      </PageHeader>

      {states && (
        <div className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm ${inSync ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {inSync ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Activity className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
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
            <div key={b.id} className={`card overflow-hidden ${b.id === branch.id ? "ring-2 ring-indigo-500" : ""}`}>
              <div className={`flex items-center justify-between px-5 py-4 ${!s ? "bg-slate-50" : s.online ? "bg-emerald-50" : "bg-rose-50"}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${!s ? "bg-slate-200 text-slate-500" : s.online ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    <Server className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-xs text-slate-500">Branch {b.id} · {b.url.replace("http://", "")}</p>
                  </div>
                </div>
                <span className={`chip ${!s ? "bg-slate-200 text-slate-600" : s.online ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                  {!s ? "Checking" : s.online ? `Online · ${s.ms} ms` : "Offline"}
                </span>
              </div>

              <div className="space-y-3 p-5 text-sm">
                <Row Icon={Database} label="Database" ok={s?.online ? s.health?.database === "ok" : undefined} />
                <Row Icon={ArrowUpFromLine} label="Publishing to RabbitMQ" ok={r ? r.publisher_connected : undefined} />
                <Row Icon={ArrowDownToLine} label="Receiving from RabbitMQ" ok={r ? r.consumer_connected : undefined} />
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-600"><ImageIcon className="h-4 w-4 text-slate-400" /> Photo storage</span>
                  <span className="text-xs font-semibold capitalize text-slate-700">{s?.health?.photo_storage ?? "–"}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  <Stat Icon={RadioTower} label="Sent" value={r?.events_sent} />
                  <Stat Icon={Inbox} label="Received" value={r?.events_received} />
                  <Stat Icon={Activity} label="Waiting" value={r?.outbox_pending} warn={!!r && r.outbox_pending > 0} />
                </div>

                <div className="pt-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Items held, by home branch</p>
                  {BRANCHES.map((home) => {
                    const n = r?.items_by_home_branch?.[home.id] ?? 0;
                    const max = Math.max(1, ...Object.values(r?.items_by_home_branch ?? { x: 1 }));
                    return (
                      <div key={home.id} className="mb-1.5 flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-slate-500">{home.name}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${s?.online ? (n / max) * 100 : 0}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs font-semibold tabular-nums text-slate-700">{s?.online ? n : "–"}</span>
                      </div>
                    );
                  })}
                </div>

                <p className="flex items-center gap-1.5 pt-1 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" /> {s?.online ? `${r?.users ?? 0} user accounts · ${r?.websocket_clients ?? 0} live connection${r?.websocket_clients === 1 ? "" : "s"}` : "Unknown"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 card p-6 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-900">Try it during the demo</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Stop a branch: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">docker compose stop branch-c</code>. Its card turns red within seconds.</li>
          <li>Report a few items at another branch. The other branches update; &quot;Waiting&quot; stays 0.</li>
          <li>Start it again: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">docker compose start branch-c</code>. It catches up and the banner turns green.</li>
          <li>Stop RabbitMQ instead and report an item: &quot;Waiting&quot; goes up, then drops to 0 when RabbitMQ is back.</li>
        </ol>
      </div>
    </div>
  );
}

function Row({ Icon, label, ok }: { Icon: typeof Database; label: string; ok: boolean | undefined }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-600"><Icon className="h-4 w-4 text-slate-400" /> {label}</span>
      {ok === undefined ? (
        <span className="text-xs text-slate-400">–</span>
      ) : ok ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> OK</span>
      ) : (
        <span className="flex items-center gap-1 text-xs font-semibold text-rose-700"><XCircle className="h-4 w-4" /> Down</span>
      )}
    </div>
  );
}

function Stat({ Icon, label, value, warn = false }: { Icon: typeof Activity; label: string; value: number | undefined; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400"><Icon className="h-3 w-3" /> {label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${warn ? "text-amber-700" : "text-slate-800"}`}>{value ?? "–"}</p>
    </div>
  );
}
