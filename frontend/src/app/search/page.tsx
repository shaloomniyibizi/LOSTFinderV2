"use client";

import { ChevronLeft, ChevronRight, RotateCcw, Search, SearchX, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import ItemCard, { ItemCardSkeleton } from "@/components/ItemCard";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { BRANCHES, CATEGORIES, COLOURS } from "@/lib/branches";
import { capitalize } from "@/lib/format";
import type { ItemPage } from "@/lib/types";

const PAGE_SIZE = 12;
const FILTER_KEYS = ["q", "type", "category", "colour", "status", "branch", "date_from", "date_to"] as const;

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  );
}

function SearchView() {
  const { api, branch } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [result, setResult] = useState<ItemPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const page = Math.max(1, Number(params.get("page") ?? 1));

  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams();
    FILTER_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) query.set(k, v);
    });
    query.set("limit", String(PAGE_SIZE));
    query.set("offset", String((page - 1) * PAGE_SIZE));
    setResult(null);
    setError(null);
    api<ItemPage>(`/items?${query}`)
      .then((r) => !cancelled && setResult(r))
      .catch((err) => {
        if (cancelled) return;
        setError(isOffline(err) ? `${branch.name} branch is not reachable. Try another branch from the menu at the top.` : (err as Error).message);
        setResult({ total: 0, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [api, params, page, branch.name]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in changes)) next.delete("page");
    router.push(`${pathname}?${next}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    update({ q: q.trim() || null });
  }

  const activeCount = FILTER_KEYS.filter((k) => k !== "q" && params.get(k)).length;
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const type = params.get("type");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Browse items"
        subtitle={<>Searching every branch&apos;s items, through the <b className="text-slate-700">{branch.name}</b> branch.</>}
      />

      <form onSubmit={onSubmit} className="mt-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by words in the title, description or location" className="input pl-10" />
        </div>
        <button className="btn-primary">Search</button>
        <button type="button" onClick={() => setShowFilters(!showFilters)} className="btn-secondary lg:hidden">
          <SlidersHorizontal className="h-4 w-4" />
          {activeCount > 0 && <span className="chip bg-indigo-600 text-white">{activeCount}</span>}
        </button>
      </form>

      <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {[
          { v: null, label: "All items" },
          { v: "LOST", label: "Lost" },
          { v: "FOUND", label: "Found" },
        ].map((t) => (
          <button
            key={t.label}
            onClick={() => update({ type: t.v })}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              type === t.v || (!type && !t.v) ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
          <div className="card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
              {activeCount > 0 && (
                <button
                  onClick={() => update(Object.fromEntries(FILTER_KEYS.filter((k) => k !== "q").map((k) => [k, null])))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  <RotateCcw className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            <Select label="Category" value={params.get("category")} options={CATEGORIES} onChange={(v) => update({ category: v })} />
            <Select label="Colour" value={params.get("colour")} options={COLOURS} onChange={(v) => update({ colour: v })} />
            <Select
              label="Status"
              value={params.get("status")}
              options={["OPEN", "MATCHED", "CLAIMED", "RETURNED"]}
              format={(s) => capitalize(s.toLowerCase())}
              onChange={(v) => update({ status: v })}
            />
            <Select
              label="Reported at branch"
              value={params.get("branch")}
              options={BRANCHES.map((b) => b.id)}
              format={(id) => BRANCHES.find((b) => b.id === id)?.name ?? id}
              onChange={(v) => update({ branch: v })}
            />
            <div>
              <label className="label">Date from</label>
              <input type="date" className="input" value={params.get("date_from") ?? ""} onChange={(e) => update({ date_from: e.target.value || null })} />
            </div>
            <div>
              <label className="label">Date to</label>
              <input type="date" className="input" value={params.get("date_to") ?? ""} onChange={(e) => update({ date_to: e.target.value || null })} />
            </div>
          </div>
        </aside>

        <section>
          {error && <div className="mb-4"><Alert>{error}</Alert></div>}
          <p className="mb-4 text-sm text-slate-500">
            {result ? `${result.total} item${result.total === 1 ? "" : "s"} found` : "Searching…"}
          </p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {result === null
              ? Array.from({ length: 6 }).map((_, i) => <ItemCardSkeleton key={i} />)
              : result.items.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
          {result && result.items.length === 0 && !error && (
            <EmptyState icon={SearchX} title="No items match your search">
              Try fewer words or clear some filters. New reports from other branches arrive within seconds.
            </EmptyState>
          )}
          {result && pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} className="btn-secondary">
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="text-sm text-slate-500">Page {page} of {pages}</span>
              <button disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} className="btn-secondary">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Select({
  label, value, options, onChange, format = capitalize,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
  format?: (s: string) => string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>{format(o)}</option>
        ))}
      </select>
    </div>
  );
}
