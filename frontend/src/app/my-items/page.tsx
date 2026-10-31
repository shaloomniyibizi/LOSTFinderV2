"use client";

import { FileText, Inbox, Package, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ItemCard, { ItemCardSkeleton } from "@/components/ItemCard";
import RequireLogin from "@/components/RequireLogin";
import { Alert, EmptyState, Hero, PageTitle, PillTabs } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { useNotifications } from "@/lib/notifications";
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
  const { liveVersion } = useNotifications();
  const [data, setData] = useState<ItemPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ItemType | "ALL" | "CLOSED">("ALL");

  useEffect(() => {
    setError(null);
    api<ItemPage>("/items/mine")
      .then(setData)
      .catch((err) => {
        setError(isOffline(err) ? `${branch.name} branch is not reachable. Try another branch.` : (err as Error).message);
        setData({ total: 0, items: [] });
      });
  }, [api, branch.name, liveVersion]);

  const all = data?.items ?? [];
  const closed = (s: string) => s === "RETURNED" || s === "CLAIMED";
  const items = data ? all.filter((i) => tab === "ALL" || (tab === "CLOSED" ? closed(i.status) : i.type === tab && !closed(i.status))) : null;

  return (
    <>
      <PageTitle crumbs={[{ label: "My reports" }]} />
      <Hero tone="green" icon={FileText} title="My reports" subtitle="Everything you have reported, at any branch. Each report is stored at the branch where you made it and copied to the others."
        actions={<>
          <Link href="/report?type=LOST" className="btn-warning"><Search className="h-4 w-4" /> Report lost item</Link>
          <Link href="/report?type=FOUND" className="btn-light"><Package className="h-4 w-4" /> Turn in found item</Link>
        </>}>
        <div className="p-4">
          <PillTabs value={tab} onChange={setTab} tabs={[
            { value: "ALL", label: "All", count: all.length },
            { value: "LOST", label: "Lost, still searching", count: all.filter((i) => i.type === "LOST" && !closed(i.status)).length },
            { value: "FOUND", label: "Found, waiting for owner", count: all.filter((i) => i.type === "FOUND" && !closed(i.status)).length },
            { value: "CLOSED", label: "Resolved", count: all.filter((i) => closed(i.status)).length },
          ]} />
        </div>
      </Hero>

      {error && <div className="mb-5"><Alert>{error}</Alert></div>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items === null
          ? Array.from({ length: 3 }).map((_, i) => <ItemCardSkeleton key={i} />)
          : items.map((item) => <ItemCard key={item.id} item={item} />)}
      </div>
      {items && items.length === 0 && !error && (
        <EmptyState icon={Inbox} title="No reports here">When you report a lost or found item, it will appear here.</EmptyState>
      )}
    </>
  );
}
