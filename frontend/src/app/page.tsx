"use client";

import {
  ArrowRight, Bell, Clock, Hand, Package, PackageCheck, Percent, Search, Send, Server, ShieldCheck, Sparkles, SquarePlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import ItemCard, { ItemCardSkeleton } from "@/components/ItemCard";
import { PillTabs } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { useAuthModal } from "@/lib/auth-modal";
import { BRANCHES } from "@/lib/branches";
import { capitalize } from "@/lib/format";
import type { ItemPage } from "@/lib/types";
import { useBranchHealth } from "@/lib/use-branch-health";
import { useOverview } from "@/lib/use-overview";

type Feed = "all" | "LOST" | "FOUND" | "RETURNED";

export default function HomePage() {
  const { api, user, ready } = useApp();
  const { openAuth } = useAuthModal();
  const router = useRouter();
  const pathname = usePathname();
  const { data } = useOverview();
  const [q, setQ] = useState("");
  const [feed, setFeed] = useState<Feed>("all");
  const [items, setItems] = useState<ItemPage | null>(null);

  useEffect(() => {
    if (ready && user && pathname === "/") router.replace("/dashboard");
  }, [ready, user, router, pathname]);

  useEffect(() => {
    setItems(null);
    const qs = feed === "all" ? "" : feed === "RETURNED" ? "&status=RETURNED" : `&type=${feed}`;
    api<ItemPage>(`/items?limit=6${qs}`).then(setItems).catch(() => setItems({ total: 0, items: [] }));
  }, [api, feed]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
  }

  const t = data?.totals;
  const categories = data?.by_category.slice(0, 8).map((c) => c.category) ?? ["phone", "wallet", "keys", "id card", "bag", "laptop"];

  return (
    <div className="space-y-6">
        {/* Hero */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card flex flex-col justify-center p-7 sm:p-10">
            <span className="chip w-fit bg-white text-slate-900"><ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Official lost &amp; found network · 3 branches</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Lost it somewhere?<br />Let&apos;s bring it home.
            </h1>
            <p className="mt-4 text-ink-2">
              One recovery network for the Campus, Bus Park and Airport offices. Report an item at any branch and it is searchable at every branch within a second, even if one office goes offline.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/report?type=LOST" className="btn-warning"><Search className="h-4 w-4" /> Report missing item</Link>
              <Link href="/report?type=FOUND" className="btn-primary"><Package className="h-4 w-4" /> Turn in a found item</Link>
            </div>
            <Link href="/found" className="btn-secondary mt-2 w-fit text-ink-2"><ShieldCheck className="h-4 w-4" /> Items in custody</Link>
          </div>
          <NetworkVisual custody={t?.found_in_custody} />
        </section>

        {/* Search */}
        <section className="card border-t-2 border-t-blue-500 p-4">
          <form onSubmit={onSearch} className="flex">
            <span className="flex items-center rounded-l-md border border-r-0 border-line bg-panel-2 px-3 text-ink-2"><Search className="h-4 w-4" /></span>
            <input className="input rounded-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by keyword: e.g. phone, student ID, black wallet, keys…" aria-label="Search all reports" />
            <button className="btn-primary rounded-l-none px-6">Search</button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="mr-1 uppercase tracking-wide text-ink-3">Category</span>
            {categories.map((c) => (
              <Link key={c} href={`/search?category=${encodeURIComponent(c)}`} className="chip bg-white text-slate-900 hover:bg-slate-200">{capitalize(c)}</Link>
            ))}
            <span className="ml-3 mr-1 uppercase tracking-wide text-ink-3">Branch</span>
            {BRANCHES.map((b) => (
              <Link key={b.id} href={`/search?branch=${b.id}`} className="chip bg-white text-slate-900 hover:bg-slate-200">{b.name}</Link>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: PackageCheck, cls: "bg-blue-600", label: "Items recovered", value: t ? <>{t.returned} <span className="text-sm font-normal text-ink-3">of {t.items} reports</span></> : "–" },
            { icon: Clock, cls: "bg-amber-400 text-slate-900", label: "Average claim-to-handover", value: t?.avg_hours_to_handover != null ? `${t.avg_hours_to_handover} hours` : "–" },
            { icon: ShieldCheck, cls: "bg-emerald-600", label: "Found items in custody", value: t?.found_in_custody ?? "–" },
            { icon: Percent, cls: "bg-cyan-500", label: "Return rate (found items)", value: t ? `${t.return_rate}%` : "–" },
          ].map((s) => (
            <div key={s.label} className="card flex items-center gap-4 p-3">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-white ${s.cls}`}><s.icon className="h-6 w-6" /></span>
              <div><p className="text-sm text-ink-2">{s.label}</p><p className="text-lg font-bold tabular-nums">{s.value}</p></div>
            </div>
          ))}
        </section>

        {/* Feed */}
        <section id="feed" className="card scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-[1.05rem] font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]" /> Recent reports across all branches
            </h2>
            <PillTabs value={feed} onChange={setFeed} tabs={[
              { value: "all", label: "All reports" },
              { value: "LOST", label: "Recently lost" },
              { value: "FOUND", label: "Turned in" },
              { value: "RETURNED", label: "Returned" },
            ]} />
          </div>
          <div className="grid gap-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {items === null ? Array.from({ length: 3 }).map((_, i) => <ItemCardSkeleton key={i} />) : items.items.map((i) => <ItemCard key={i.id} item={i} />)}
            {items && items.items.length === 0 && <p className="col-span-full py-10 text-center text-ink-3">No reports here yet.</p>}
          </div>
          <div className="border-t border-line p-3 text-center">
            <Link href={feed === "LOST" ? "/lost" : feed === "FOUND" ? "/found" : "/search"} className="btn-secondary">Browse all reports <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>

        {/* Branches */}
        <section id="branches" className="scroll-mt-20 pt-6 text-center">
          <h2 className="text-2xl font-bold">Explore by branch</h2>
          <p className="mt-1 text-ink-2">Each office keeps its own database, and a full copy of everyone else&apos;s.</p>
          <div className="mt-5 grid gap-5 text-left md:grid-cols-3">
            {BRANCHES.map((b, i) => {
              const row = data?.by_branch.find((x) => x.branch === b.id);
              const tone = ["bg-blue-600", "bg-cyan-600", "bg-emerald-600"][i];
              return (
                <div key={b.id} className={`relative overflow-hidden rounded-lg text-white shadow ${tone}`}>
                  <Server className="absolute right-4 top-4 h-16 w-16 opacity-15" />
                  <div className="p-4">
                    <p className="text-4xl font-bold tabular-nums">{row ? row.lost + row.found : "–"}</p>
                    <p className="mt-1 text-lg">{b.name}</p>
                    <p className="text-sm text-white/80">{b.place} · {row?.lost ?? 0} lost, {row?.found ?? 0} found</p>
                  </div>
                  <Link href={`/search?branch=${b.id}`} className="flex items-center justify-center gap-1 bg-black/15 py-2 text-sm hover:bg-black/25">
                    Browse this branch <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 pt-6 text-center">
          <span className="chip bg-amber-400 text-slate-900">SAFE &amp; VERIFIED</span>
          <h2 className="mt-2 text-2xl font-bold">How LostFinder works</h2>
          <p className="mt-1 text-ink-2">Designed to prevent false claims and get items back to the right person.</p>
          <div className="mt-5 grid gap-5 text-left md:grid-cols-3">
            {[
              { n: 1, c: "border-l-blue-500", t: "Post a report", d: "Describe the item, where and when, and add a photo. Your report is copied to every branch.", f: "Contact details are never shown publicly", icon: Send },
              { n: 2, c: "border-l-amber-400", t: "Automatic match & alert", d: "Every branch compares new reports by category, colour, words and dates, and alerts you live.", f: "Matches found across all branches", icon: Bell },
              { n: 3, c: "border-l-emerald-500", t: "Safe retrieval", d: "Claim with a detail only the owner knows. Staff at the item's branch verify it and hand it over.", f: "ID check at handover", icon: Hand },
            ].map((s) => (
              <div key={s.n} className={`card border-l-4 p-5 ${s.c}`}>
                <p className="flex items-center gap-2 font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded bg-brand-strong text-xs text-white">{s.n}</span> {s.t}</p>
                <p className="mt-2 text-sm text-ink-2">{s.d}</p>
                <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-3"><s.icon className="h-3.5 w-3.5" /> {s.f}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="overflow-hidden rounded-lg bg-gradient-to-r from-[#0f1d40] to-[#162a5b] p-7 text-white shadow sm:p-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <span className="chip bg-amber-400 text-slate-900"><Sparkles className="h-3.5 w-3.5" /> Every report counts</span>
              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Found something valuable?</h2>
              <p className="mt-2 text-white/80">Hand it in at the nearest branch desk and report it here. The owner is alerted the moment their report matches, at whichever branch they used.</p>
            </div>
            <div className="flex flex-col gap-2 sm:w-64">
              <Link href="/report?type=FOUND" className="btn-warning py-2.5"><SquarePlus className="h-4 w-4" /> Turn in a found item</Link>
              <button onClick={() => openAuth("register")} className="btn-outline-light py-2.5">Create a free account</button>
            </div>
          </div>
        </section>
    </div>
  );
}

/** Three branch nodes connected through the message broker, with live status. */
function NetworkVisual({ custody }: { custody?: number }) {
  const health = useBranchHealth();
  const pos = [{ x: 18, y: 26 }, { x: 82, y: 26 }, { x: 50, y: 80 }];
  return (
    <div className="relative min-h-80 overflow-hidden rounded-lg bg-gradient-to-br from-[#0f1d40] via-[#1d3f8f] to-[#2f6ae0] text-white shadow">
      <span className="chip absolute left-4 top-4 z-10 bg-white text-slate-900"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live recovery network</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {pos.map((p, i) => (
          <line key={i} x1={p.x} y1={p.y} x2={50} y2={50} stroke="white" strokeOpacity={0.35} strokeWidth={0.4} strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke">
            <animate attributeName="stroke-dashoffset" from="6" to="0" dur="1.2s" repeatCount="indefinite" />
          </line>
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/10 backdrop-blur"><Sparkles className="h-6 w-6" /></span>
        <span className="mt-1 text-xs text-white/80">RabbitMQ</span>
      </div>
      {BRANCHES.map((b, i) => {
        const h = health?.[b.id];
        return (
          <div key={b.id} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/10 px-3 py-2 text-center ring-1 ring-white/20 backdrop-blur"
            style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
            <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
              <span className={`h-2 w-2 rounded-full ${!h ? "bg-slate-300" : h.online ? "bg-emerald-400" : "bg-rose-400"}`} /> {b.name}
            </p>
            <p className="text-[11px] text-white/70">{!h ? "checking…" : h.online ? `online · ${h.ms} ms` : "offline"}</p>
          </div>
        );
      })}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-4 pt-10">
        <p className="font-semibold">Three branches, one network</p>
        <p className="text-sm text-white/80">{custody ?? "…"} found items currently waiting for their owners</p>
      </div>
    </div>
  );
}
