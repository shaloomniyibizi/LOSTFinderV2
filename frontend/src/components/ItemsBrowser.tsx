"use client";

import { Filter, LayoutGrid, Network, Package, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { BRANCHES, CATEGORIES } from "@/lib/branches";
import { capitalize } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import type { ItemPage, ItemStatus, ItemType } from "@/lib/types";
import { useOverview } from "@/lib/use-overview";
import ItemCard, { ItemCardSkeleton } from "./ItemCard";
import { Alert, EmptyState, Hero, PageTitle, PillTabs } from "./ui";

const PAGE = 12;
type StatusTab = ItemStatus | "ALL";

/** The Lost items, Found items and Search pages: hero, filters, status tabs and a grid of cards. */
export default function ItemsBrowser({ type }: { type?: ItemType }) {
  const { api, branch } = useApp();
  const { liveVersion } = useNotifications();
  const { data: overview } = useOverview();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [home, setHome] = useState(params.get("branch") ?? "");
  const [status, setStatus] = useState<StatusTab>((params.get("status") as StatusTab) || "ALL");
  const [page, setPage] = useState<ItemPage | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (type) qs.set("type", type);
    const sq = params.get("q");
    const sc = params.get("category");
    const sb = params.get("branch");
    if (sq) qs.set("q", sq);
    if (sc) qs.set("category", sc);
    if (sb) qs.set("branch", sb);
    if (status !== "ALL") qs.set("status", status);
    setError(null);
    api<ItemPage>(`/items?${qs}`)
      .then(setPage)
      .catch((err) => {
        setError(isOffline(err) ? `${branch.name} branch is not reachable. Pick another branch at the top.` : (err as Error).message);
        setPage({ total: 0, items: [] });
      });
  }, [api, branch.name, params, status, type, limit]);

  useEffect(load, [load, liveVersion]);

  function apply(e: FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (category) qs.set("category", category);
    if (home) qs.set("branch", home);
    setLimit(PAGE);
    router.replace(`?${qs}`);
  }

  const counts = type === "LOST" ? overview?.lost_by_status : type === "FOUND" ? overview?.found_by_status : undefined;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const filtered = !!(params.get("q") || params.get("category") || params.get("branch"));
  const isLost = type === "LOST";

  const hero = type === "LOST"
    ? { tone: "orange" as const, icon: Search, title: "Lost items", sub: `${total ?? "…"} reports from people looking for their belongings. Seen one of these? Let them know.` }
    : type === "FOUND"
      ? { tone: "blue" as const, icon: Package, title: "Found items", sub: `${total ?? "…"} items handed in at our branches. Is one of them yours? Claim it with a detail only the owner knows.` }
      : { tone: "teal" as const, icon: Search, title: "Search all reports", sub: "Every lost and found report from all three branches." };

  return (
    <>
      <PageTitle crumbs={[{ label: hero.title }]} />
      <Hero tone={hero.tone} icon={hero.icon} title={hero.title} subtitle={hero.sub}
        actions={<>
          <Link href={isLost ? "/found" : "/lost"} className="btn-outline-light">{isLost ? <Package className="h-4 w-4" /> : <Search className="h-4 w-4" />} Browse {isLost ? "found" : "lost"} items</Link>
          <Link href={`/report?type=${isLost ? "LOST" : "FOUND"}`} className="btn-light"><Plus className="h-4 w-4" /> {isLost ? "Report lost item" : "Turn in found item"}</Link>
        </>}>
        <form onSubmit={apply} className="grid gap-3 p-4 md:grid-cols-[1.4fr_1fr_0.8fr_auto] md:items-end">
          <div>
            <label className="mb-1 block text-sm text-ink-2" htmlFor="q">Search</label>
            <div className="flex">
              <span className="flex items-center rounded-l-md border border-r-0 border-line bg-panel-2 px-3 text-ink-2"><Search className="h-4 w-4" /></span>
              <input id="q" className="input rounded-l-none" placeholder="Title, description or location" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-2" htmlFor="cat">Category</label>
            <div className="flex">
              <span className="flex items-center rounded-l-md border border-r-0 border-line bg-panel-2 px-3 text-ink-2"><LayoutGrid className="h-4 w-4" /></span>
              <select id="cat" className="input rounded-l-none" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-2" htmlFor="br">Reported at</label>
            <div className="flex">
              <span className="flex items-center rounded-l-md border border-r-0 border-line bg-panel-2 px-3 text-ink-2"><Network className="h-4 w-4" /></span>
              <select id="br" className="input rounded-l-none" value={home} onChange={(e) => setHome(e.target.value)}>
                <option value="">All branches</option>
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <button className="btn-primary h-[38px] px-6"><Filter className="h-4 w-4" /> Filter</button>
          {type && (
            <div className="md:col-span-4">
              <PillTabs value={status} onChange={(v) => { setStatus(v); setLimit(PAGE); }} tabs={[
                { value: "ALL", label: "All", count: total },
                { value: "OPEN", label: "Open", count: counts?.OPEN },
                { value: "MATCHED", label: "Possible match found", count: counts?.MATCHED },
                { value: "CLAIMED", label: "Claim approved", count: counts?.CLAIMED },
                { value: "RETURNED", label: "Returned to owner", count: counts?.RETURNED },
              ]} />
            </div>
          )}
        </form>
      </Hero>

      {error && <div className="mb-5"><Alert>{error}</Alert></div>}
      {page && (
        <p className="mb-3 text-sm text-ink-2">
          Showing <b className="text-ink">{page.items.length ? `1–${page.items.length}` : 0}</b> of <b className="text-ink">{page.total}</b>
          {filtered && <> · <button className="text-brand hover:underline" onClick={() => { setQ(""); setCategory(""); setHome(""); router.replace("?"); }}>clear filters</button></>}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {page === null
          ? Array.from({ length: 6 }).map((_, i) => <ItemCardSkeleton key={i} />)
          : page.items.map((item) => <ItemCard key={item.id} item={item} />)}
      </div>
      {page && page.items.length === 0 && !error && (
        <EmptyState icon={isLost ? Search : Package} title="Nothing here">
          {filtered || status !== "ALL" ? "No reports match these filters." : "No reports yet."}
        </EmptyState>
      )}
      {page && page.items.length < page.total && (
        <div className="mt-6 text-center">
          <button onClick={() => setLimit((l) => Math.min(100, l + PAGE))} className="btn-secondary">Load more</button>
        </div>
      )}
    </>
  );
}
