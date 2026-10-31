"use client";

import { AlertCircle, CheckCircle2, Clock, Eye, Hand, ImageOff, MapPin, UserCog } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { photoUrl } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { capitalize, timeAgo } from "@/lib/format";
import type { Item } from "@/lib/types";
import CategoryIcon from "./CategoryIcon";

export const STATUS_LOOK: Record<Item["status"], { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "bg-white text-slate-900" },
  MATCHED: { label: "Possible match found", cls: "bg-amber-400 text-slate-900" },
  CLAIMED: { label: "Claim approved", cls: "bg-blue-600 text-white" },
  RETURNED: { label: "Returned to owner", cls: "bg-emerald-600 text-white" },
};

export function ItemPhoto({ item, className = "" }: { item: Item; className?: string }) {
  const { branch } = useApp();
  const [broken, setBroken] = useState(false);
  const src = photoUrl(branch.url, item.photo_hash);
  return src && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={item.title} loading="lazy" onError={() => setBroken(true)} className={`h-full w-full object-cover ${className}`} />
  ) : (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-panel-2 to-line text-ink-3">
      {broken ? <ImageOff className="h-8 w-8" /> : <CategoryIcon category={item.category} className="h-10 w-10" />}
      <span className="text-xs">{broken ? "Photo unavailable" : "No photo"}</span>
    </div>
  );
}

export function TypeTag({ type }: { type: Item["type"] }) {
  return type === "LOST" ? (
    <span className="chip bg-rose-600 text-white shadow"><AlertCircle className="h-3.5 w-3.5" /> Missing item</span>
  ) : (
    <span className="chip bg-blue-600 text-white shadow"><CheckCircle2 className="h-3.5 w-3.5" /> Found item</span>
  );
}

export default function ItemCard({ item }: { item: Item }) {
  const { user } = useApp();
  const mine = !!user && item.reported_by === user.id;
  const active = item.status === "OPEN" || item.status === "MATCHED";
  const status = STATUS_LOOK[item.status];

  let action = { href: `/items/${item.id}`, label: "View details", icon: Eye, cls: "border-line text-ink-2 hover:bg-panel-2" };
  if (mine) action = { ...action, label: "Your report · manage", icon: UserCog };
  else if (active && item.type === "LOST")
    action = { href: `/report?type=FOUND&category=${encodeURIComponent(item.category)}`, label: "I found this item", icon: Hand, cls: "border-amber-400 text-amber-600 dark:text-amber-300 hover:bg-amber-400/10" };
  else if (active && item.type === "FOUND")
    action = { href: `/items/${item.id}#claim`, label: "Is this yours? Claim it", icon: Hand, cls: "border-blue-500 text-brand hover:bg-blue-500/10" };

  return (
    <div className="card group flex flex-col overflow-hidden transition hover:shadow-lg">
      <Link href={`/items/${item.id}`} className="relative block h-44 overflow-hidden bg-panel-2">
        <ItemPhoto item={item} className="transition duration-300 group-hover:scale-105" />
        <span className="absolute left-3 top-3"><TypeTag type={item.type} /></span>
        <span className={`chip absolute right-3 top-3 shadow ${status.cls}`}>{status.label}</span>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-2 text-sm text-ink-3">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeAgo(item.created_at)}</span>
          <span title="Home branch: where it was reported">{branchName(item.home_branch)}</span>
        </div>
        <Link href={`/items/${item.id}`} className="line-clamp-1 font-bold text-ink hover:text-brand">{item.title}</Link>
        <p className="line-clamp-3 min-h-[3.75rem] text-sm text-ink-2">{item.description || "No description given."}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          {item.location ? (
            <span className="chip max-w-[65%] bg-white text-slate-900"><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{item.location}</span></span>
          ) : <span />}
          <span className="text-sm text-ink-3">{capitalize(item.category)}</span>
        </div>
        <Link href={action.href} className={`btn mt-3 border ${action.cls}`}>
          <action.icon className="h-4 w-4" /> {action.label}
        </Link>
      </div>
    </div>
  );
}

export function ItemCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="h-44 animate-pulse bg-panel-2" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-panel-2" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-panel-2" />
        <div className="h-3 w-full animate-pulse rounded bg-panel-2" />
        <div className="h-8 w-full animate-pulse rounded bg-panel-2" />
      </div>
    </div>
  );
}
