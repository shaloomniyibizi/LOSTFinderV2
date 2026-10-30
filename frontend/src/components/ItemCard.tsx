"use client";

import { CalendarDays, ImageOff, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { photoUrl } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { capitalize, formatDate } from "@/lib/format";
import type { Item } from "@/lib/types";
import { BranchChip, StatusBadge, TypeBadge } from "./badges";
import CategoryIcon from "./CategoryIcon";

export default function ItemCard({ item }: { item: Item }) {
  const { branch } = useApp();
  const [broken, setBroken] = useState(false);
  const src = photoUrl(branch.url, item.photo_hash);

  return (
    <Link
      href={`/items/${item.id}`}
      className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {src && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={item.title}
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
            {broken ? <ImageOff className="h-8 w-8" /> : <CategoryIcon category={item.category} className="h-10 w-10" />}
            <span className="text-xs font-medium">{broken ? "Photo unavailable" : "No photo"}</span>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <TypeBadge type={item.type} className="shadow-sm" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-slate-900">{item.title}</h3>
          <StatusBadge status={item.status} />
        </div>
        <p className="text-sm text-slate-500">
          {capitalize(item.category)}
          {item.colour ? ` · ${capitalize(item.colour)}` : ""}
        </p>
        <div className="mt-auto flex flex-col gap-1.5 pt-2 text-xs text-slate-500">
          {item.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> <span className="line-clamp-1">{item.location}</span>
            </span>
          )}
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> {formatDate(item.event_date)}
            </span>
            <BranchChip id={item.home_branch} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ItemCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-[4/3] animate-pulse bg-slate-200" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
      </div>
    </div>
  );
}
