"use client";

import { ArrowRight, Building2, HandHelping, PackageCheck, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import ItemCard, { ItemCardSkeleton } from "@/components/ItemCard";
import { useApp } from "@/lib/app-context";
import { BRANCHES } from "@/lib/branches";
import type { Item, ItemPage } from "@/lib/types";
import { useBranchHealth } from "@/lib/use-branch-health";

export default function HomePage() {
  const { api, branch } = useApp();
  const router = useRouter();
  const health = useBranchHealth();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Item[] | null>(null);
  const [lost, setLost] = useState<Item[] | null>(null);
  const [stats, setStats] = useState<{ lost: number; found: number; returned: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFound(null);
    setLost(null);
    const get = (query: string) => api<ItemPage>(`/items?${query}`);
    Promise.all([
      get("type=FOUND&limit=4"),
      get("type=LOST&limit=4"),
      get("type=LOST&status=OPEN&limit=1"),
      get("type=LOST&status=MATCHED&limit=1"),
      get("type=FOUND&status=OPEN&limit=1"),
      get("type=FOUND&status=MATCHED&limit=1"),
      get("status=RETURNED&limit=1"),
    ])
      .then(([f, l, openLost, matchedLost, openFound, matchedFound, returned]) => {
        if (cancelled) return;
        setFound(f.items);
        setLost(l.items);
        // still being searched for = open or matched (not yet claimed or returned)
        setStats({
          lost: openLost.total + matchedLost.total,
          found: openFound.total + matchedFound.total,
          returned: returned.total,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFound([]);
        setLost([]);
        setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
  }

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-violet-400/30 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <span className="chip bg-white/15 text-white ring-1 ring-white/25">
            <Building2 className="h-3.5 w-3.5" /> {BRANCHES.length} branch offices · one shared network
          </span>
          <h1 className="mt-5 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Lost something? Found something?
            <span className="block text-indigo-200">Let&apos;s bring it home.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-indigo-100">
            Report an item at any branch, and it is instantly searchable at every branch: campus, bus park and airport.
          </p>

          <form onSubmit={onSearch} className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search: black laptop, blue phone, house keys…"
                className="h-13 w-full rounded-2xl border-0 bg-white py-3.5 pl-12 pr-4 text-slate-900 shadow-lg placeholder:text-slate-400 focus:ring-4 focus:ring-white/40 focus:outline-none"
              />
            </div>
            <button className="btn h-13 rounded-2xl bg-slate-900 px-6 text-white shadow-lg hover:bg-slate-800">Search</button>
          </form>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/report?type=LOST" className="btn rounded-xl bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25">
              <Search className="h-4 w-4" /> I lost something
            </Link>
            <Link href="/report?type=FOUND" className="btn rounded-xl bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25">
              <HandHelping className="h-4 w-4" /> I found something
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 mx-auto -mt-8 max-w-6xl px-4 sm:px-6">
        <div className="card grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { label: "Lost items being searched for", value: stats?.lost, Icon: Search, color: "text-amber-600 bg-amber-50" },
            { label: "Found items waiting for owners", value: stats?.found, Icon: HandHelping, color: "text-emerald-600 bg-emerald-50" },
            { label: "Items returned to their owners", value: stats?.returned, Icon: PackageCheck, color: "text-indigo-600 bg-indigo-50" },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} className="flex items-center gap-4 p-5">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-2xl font-bold text-slate-900">{value ?? "–"}</p>
                <p className="text-sm text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent items */}
      <ItemsSection title="Recently found" subtitle="Is one of these yours?" items={found} href="/search?type=FOUND" />
      <ItemsSection title="Recently reported lost" subtitle="Have you seen these?" items={lost} href="/search?type=LOST" />

      {/* How it works */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <h2 className="text-xl font-bold tracking-tight">How it works</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            { Icon: PackageCheck, title: "1. Report it", text: "Describe the item, where and when, and add a photo. Any user can report lost or found items." },
            { Icon: Zap, title: "2. Shared everywhere", text: "Your report is saved at your branch and copied to every other branch within seconds." },
            { Icon: ShieldCheck, title: "3. Safe return", text: "Branch staff check ownership before handing an item over, so it goes back to the right person." },
          ].map(({ Icon, title, text }) => (
            <div key={title} className="card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Branch network */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Our branch network</h2>
            <p className="mt-1 text-sm text-slate-500">
              You are connected to <b className="text-slate-700">{branch.name}</b>. Every branch keeps a full copy of all items.
            </p>
          </div>
          <Link href="/status" className="hidden text-sm font-semibold text-indigo-600 hover:text-indigo-700 sm:inline-flex sm:items-center sm:gap-1">
            Network status <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {BRANCHES.map((b) => {
            const h = health?.[b.id];
            return (
              <div key={b.id} className={`card p-5 ${b.id === branch.id ? "ring-2 ring-indigo-500" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Branch {b.id}</span>
                  <span className={`chip ${!h ? "bg-slate-100 text-slate-500" : h.online ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${!h ? "bg-slate-400" : h.online ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {!h ? "Checking" : h.online ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="mt-3 text-lg font-semibold">{b.name}</p>
                <p className="text-sm text-slate-500">{b.place}</p>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function ItemsSection({ title, subtitle, items, href }: { title: string; subtitle: string; items: Item[] | null; href: string }) {
  return (
    <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items === null
          ? Array.from({ length: 4 }).map((_, i) => <ItemCardSkeleton key={i} />)
          : items.length === 0
            ? (
              <div className="card col-span-full flex items-center gap-3 p-6 text-sm text-slate-500">
                <Sparkles className="h-5 w-5 text-slate-400" /> Nothing here yet. Be the first to report an item.
              </div>
            )
            : items.map((item) => <ItemCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}
