"use client";

import { Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ItemCard, { ItemCardSkeleton } from "@/components/ItemCard";
import RequireLogin from "@/components/RequireLogin";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import type { ItemPage, ItemType } from "@/lib/types";

export default function MyItemsPage() {
  return (
    <RequireLogin reason="Log in to see the items you have reported.">
      <MyItems />
    </RequireLogin>
  );
}

function MyItems() {
  const { api, branch } = useApp();
  const [data, setData] = useState<ItemPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ItemType | "ALL">("ALL");

  useEffect(() => {
    setData(null);
    setError(null);
    api<ItemPage>("/items/mine")
      .then(setData)
      .catch((err) => {
        setError(isOffline(err) ? `${branch.name} branch is not reachable. Try another branch.` : (err as Error).message);
        setData({ total: 0, items: [] });
      });
  }, [api, branch.name]);

  const items = data?.items.filter((i) => tab === "ALL" || i.type === tab) ?? null;
  const count = (t: ItemType) => data?.items.filter((i) => i.type === t).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader title="My reports" subtitle="Everything you have reported, at any branch.">
        <Link href="/report" className="btn-primary"><Plus className="h-4 w-4" /> New report</Link>
      </PageHeader>

      <div className="mt-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {([
          ["ALL", `All (${data?.total ?? 0})`],
          ["LOST", `Lost (${count("LOST")})`],
          ["FOUND", `Found (${count("FOUND")})`],
        ] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === v ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mt-6"><Alert>{error}</Alert></div>}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items === null
          ? Array.from({ length: 4 }).map((_, i) => <ItemCardSkeleton key={i} />)
          : items.map((item) => <ItemCard key={item.id} item={item} />)}
      </div>
      {items && items.length === 0 && !error && (
        <EmptyState icon={Inbox} title="No reports yet">
          When you report a lost or found item, it will appear here.
        </EmptyState>
      )}
    </div>
  );
}
