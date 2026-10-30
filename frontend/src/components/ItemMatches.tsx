"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { photoUrl } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { formatDate } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import type { Item, Match } from "@/lib/types";
import { TypeBadge } from "./badges";
import CategoryIcon from "./CategoryIcon";

/** "Possible matches": items of the opposite type that look like this one, with a score. */
export default function ItemMatches({ item }: { item: Item }) {
  const { api, branch } = useApp();
  const { liveVersion } = useNotifications();
  const [matches, setMatches] = useState<Match[] | null>(null);

  useEffect(() => {
    api<Match[]>(`/items/${item.id}/matches`).then(setMatches).catch(() => setMatches([]));
  }, [api, item.id, item.version, liveVersion]);

  if (!matches) return null;
  const lookingFor = item.type === "LOST" ? "found items" : "lost reports";

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-violet-600" /> Possible matches</h2>
      {matches.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No similar {lookingFor} yet, at any branch. You&apos;ll get a notification as soon as one is reported.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((m) => {
            const src = photoUrl(branch.url, m.item.photo_hash);
            return (
              <Link key={m.id} href={`/items/${m.item.id}`} className="card group flex gap-4 p-4 transition hover:border-violet-300 hover:shadow-md">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <CategoryIcon category={m.item.category} className="h-8 w-8" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><TypeBadge type={m.item.type} /></div>
                  <p className="mt-1 line-clamp-1 font-semibold text-slate-900">{m.item.title}</p>
                  <p className="text-xs text-slate-500">{branchName(m.item.home_branch)} · {formatDate(m.item.event_date)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${m.score}%` }} />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-violet-700">{m.score}%</span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 self-center text-slate-300 transition group-hover:text-violet-500" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
