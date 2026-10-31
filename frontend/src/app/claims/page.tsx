"use client";

import { ArrowRight, Check, ClipboardCheck, Clock, CloudOff, Hand, Hourglass, Inbox, MapPin, Package, PackageCheck, Search, ShoppingBag, XCircle } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { QueuedCard } from "@/components/ClaimPanel";
import { ItemPhoto } from "@/components/ItemCard";
import RequireLogin from "@/components/RequireLogin";
import { EmptyState, Hero, IconTile, PageTitle } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { timeAgo } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import type { Claim, Item, ItemPage, QueuedClaim } from "@/lib/types";

export default function ClaimsPage() {
  return (
    <RequireLogin reason="Log in to follow your claims.">
      <Claims />
    </RequireLogin>
  );
}

function Claims() {
  const { api, branch } = useApp();
  const { liveVersion } = useNotifications();
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [onMine, setOnMine] = useState<Claim[] | null>(null);
  const [queued, setQueued] = useState<QueuedClaim[]>([]);

  useEffect(() => {
    api<Claim[]>("/claims/mine").then(async (cs) => {
      setClaims(cs);
      const loaded = await Promise.all(cs.map((c) => api<Item>(`/items/${c.item_id}`).catch(() => null)));
      setItems((prev) => ({ ...prev, ...Object.fromEntries(loaded.filter(Boolean).map((i) => [i!.id, i!])) }));
    }).catch(() => setClaims([]));
    api<QueuedClaim[]>("/claims/queued/mine").then((q) => setQueued(q.filter((x) => x.status !== "DELIVERED"))).catch(() => {});
    api<ItemPage>("/items/mine").then(async (p) => {
      const found = p.items.filter((i) => i.type === "FOUND");
      setItems((prev) => ({ ...prev, ...Object.fromEntries(found.map((i) => [i.id, i])) }));
      const lists = await Promise.all(found.map((i) => api<Claim[]>(`/items/${i.id}/claims`).catch(() => [])));
      setOnMine(lists.flat());
    }).catch(() => setOnMine([]));
  }, [api, liveVersion]);

  const list = claims ?? [];
  const ready = list.filter((c) => c.status === "APPROVED" && !c.handed_over_at);
  const stats = [
    { label: "In review", value: list.filter((c) => c.status === "PENDING").length, icon: Hourglass, tint: "amber" as const },
    { label: "Ready to collect", value: ready.length, icon: ShoppingBag, tint: "green" as const },
    { label: "Collected", value: list.filter((c) => c.handed_over_at).length, icon: PackageCheck, tint: "blue" as const },
    { label: "Not accepted", value: list.filter((c) => c.status === "REJECTED").length, icon: XCircle, tint: "slate" as const },
  ];

  return (
    <>
      <PageTitle crumbs={[{ label: "My claims" }]} />
      <Hero tone="blue" icon={ClipboardCheck} title="My claims" subtitle="Track the items you have claimed and the claims on items you turned in."
        actions={<Link href="/found" className="btn-outline-light"><Package className="h-4 w-4" /> Browse found items</Link>}>
        <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <IconTile icon={s.icon} tint={s.tint} size="sm" />
              <div><p className="text-xl font-bold tabular-nums">{s.value}</p><p className="text-sm text-ink-3">{s.label}</p></div>
            </div>
          ))}
        </div>
      </Hero>

      {ready.length > 0 && (
        <div className="mb-6 rounded-md border-l-4 border-emerald-500 bg-panel p-4 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400"><ShoppingBag className="h-4 w-4" /> Ready to collect</p>
          <p className="mt-1 text-sm">Bring your ID to the branch desk named below to pick up:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {ready.map((c) => (
              <li key={c.id}><Link href={`/items/${c.item_id}`} className="underline underline-offset-2">{c.item_title}</Link> at the <b>{branchName(c.home_branch)}</b> branch</li>
            ))}
          </ul>
        </div>
      )}

      {queued.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 flex items-center gap-2 text-xl font-bold"><CloudOff className="h-5 w-5 text-amber-500" /> Waiting for an offline branch</h2>
          <p className="mb-4 text-sm text-ink-2">Saved at {branch.name}. They are sent automatically when the item&apos;s branch is back.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {queued.map((q) => (
              <div key={q.id}>
                <Link href={`/items/${q.item_id}`} className="mb-2 block font-semibold hover:text-brand">{q.item_title ?? "Item"}</Link>
                <QueuedCard q={q} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><Hand className="h-5 w-5 text-brand" /> Items I claimed <Count n={list.length} /></h2>
        {claims === null ? <div className="card h-40 animate-pulse" /> : list.length === 0 ? (
          <EmptyState icon={Search}>You haven&apos;t claimed anything. If something you lost was handed in, open it and click <b>Claim</b>.</EmptyState>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">{list.map((c) => <ClaimTile key={c.id} c={c} item={items[c.item_id]} />)}</div>
        )}
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><Package className="h-5 w-5 text-brand" /> Claims on items I found <Count n={onMine?.length ?? 0} /></h2>
        {onMine === null ? <div className="card h-32 animate-pulse" /> : onMine.length === 0 ? (
          <EmptyState icon={Inbox}>Nobody has claimed an item you turned in yet.</EmptyState>
        ) : (
          <div className="card divide-y divide-line">
            {onMine.map((c) => (
              <Link key={c.id} href={`/items/${c.item_id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-panel-2">
                <span className="flex-1"><b>{c.item_title}</b><span className="block text-sm text-ink-3">claimed by {c.claimant_name ?? "someone"} · {timeAgo(c.created_at)}</span></span>
                <StagePill c={c} />
                <ArrowRight className="h-4 w-4 text-ink-3" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Count({ n }: { n: number }) {
  return <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink-3/40 px-2 text-sm">{n}</span>;
}

function StagePill({ c }: { c: Claim }) {
  if (c.handed_over_at) return <span className="chip bg-blue-600 text-white">Collected</span>;
  return {
    PENDING: <span className="chip bg-amber-400 text-slate-900">In review</span>,
    APPROVED: <span className="chip bg-emerald-600 text-white">Approved</span>,
    REJECTED: <span className="chip bg-rose-600 text-white">Not accepted</span>,
  }[c.status];
}

const STEPS = ["Submitted", "In review", "Approved", "Collected"];

function ClaimTile({ c, item }: { c: Claim; item?: Item }) {
  const done = c.handed_over_at ? 4 : c.status === "APPROVED" ? 3 : c.status === "PENDING" ? 1 : 2;
  const rejected = c.status === "REJECTED";
  return (
    <article className={`card flex flex-col border-l-4 ${rejected ? "border-l-rose-500" : c.handed_over_at ? "border-l-blue-500" : c.status === "APPROVED" ? "border-l-emerald-500" : "border-l-amber-400"}`}>
      <div className="flex gap-4 p-4">
        <div className="h-20 w-24 shrink-0 overflow-hidden rounded-md bg-panel-2">{item ? <ItemPhoto item={item} /> : null}</div>
        <div className="min-w-0">
          <p className="truncate font-bold">{c.item_title ?? item?.title ?? "Item"}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {branchName(c.home_branch)} branch</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeAgo(c.created_at)}</span>
          </p>
          <div className="mt-1.5"><StagePill c={c} /></div>
        </div>
      </div>
      {rejected ? (
        <p className="mx-4 mb-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {c.staff_note ? <>Staff note: “{c.staff_note}”</> : "Staff could not confirm this item is yours."}
        </p>
      ) : (
        <ol className="mx-4 mb-4 flex items-center" aria-label="Claim progress">
          {STEPS.map((s, i) => {
            const state = i < done ? "done" : i === done ? "current" : "todo";
            return (
              <Fragment key={s}>
                {i > 0 && <span className={`mt-[13px] h-0.5 flex-1 self-start ${i <= done ? "bg-emerald-500" : "bg-line"}`} />}
                <li className="flex flex-col items-center gap-1">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs ${
                    state === "done" ? "border-emerald-500 bg-emerald-600 text-white" : state === "current" ? "border-blue-500 text-brand ring-4 ring-blue-500/20" : "border-line text-ink-3"}`}>
                    {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className={`text-xs ${state === "current" ? "font-semibold text-ink" : "text-ink-3"}`}>{s}</span>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
      <Link href={`/items/${c.item_id}`} className="mt-auto flex items-center justify-between border-t border-line px-4 py-2.5 text-sm hover:bg-panel-2">
        {c.status === "APPROVED" && !c.handed_over_at ? "Collection details" : "Open item"} <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
