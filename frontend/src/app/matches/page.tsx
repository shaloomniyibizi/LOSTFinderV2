"use client";

import { ArrowLeftRight, Calendar, Eye, Hand, Hourglass, Link2, MapPin, Package, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ScoreRing } from "@/components/charts";
import { ItemPhoto } from "@/components/ItemCard";
import RequireLogin from "@/components/RequireLogin";
import { Alert, EmptyState, Hero, PageTitle, PillTabs } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { formatDate } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import type { Item, MyMatch } from "@/lib/types";

export default function MatchesPage() {
  return (
    <RequireLogin reason="Log in to see possible matches for the items you reported.">
      <Matches />
    </RequireLogin>
  );
}

type Filter = "active" | "strong" | "closed" | "all";
const isActive = (i: Item) => i.status === "OPEN" || i.status === "MATCHED";

function Matches() {
  const { api } = useApp();
  const { liveVersion } = useNotifications();
  const [matches, setMatches] = useState<MyMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");

  useEffect(() => {
    api<MyMatch[]>("/me/matches").then(setMatches).catch((e) => { setError((e as Error).message); setMatches([]); });
  }, [api, liveVersion]);

  const own = (m: MyMatch) => (m.side === "LOST" ? m.lost : m.found);
  const all = matches ?? [];
  const active = all.filter((m) => isActive(own(m)));
  const pick: Record<Filter, MyMatch[]> = {
    active,
    strong: active.filter((m) => m.score >= 80),
    closed: all.filter((m) => !isActive(own(m))),
    all,
  };
  const shown = pick[filter];
  const forLost = shown.filter((m) => m.side === "LOST");
  const forFound = shown.filter((m) => m.side === "FOUND");

  return (
    <>
      <PageTitle crumbs={[{ label: "My matches" }]} />
      <Hero tone="violet" icon={Link2} title="My matches"
        subtitle="Possible pairings between lost and found reports from all three branches, scored on category, colour, shared words and dates."
        badges={active.length > 0 ? <span className="chip bg-amber-400 px-3 py-1 text-sm text-slate-900"><Hourglass className="h-4 w-4" /> {active.length} waiting for you</span> : undefined}>
        <div className="p-4">
          <PillTabs value={filter} onChange={setFilter} tabs={[
            { value: "active", label: "Waiting for you", count: active.length },
            { value: "strong", label: "Strong (80%+)", count: pick.strong.length },
            { value: "closed", label: "Closed", count: pick.closed.length },
            { value: "all", label: "All", count: all.length },
          ]} />
        </div>
      </Hero>

      {error && <div className="mb-5"><Alert>{error}</Alert></div>}
      {matches === null && <div className="grid gap-6 lg:grid-cols-2">{[0, 1].map((i) => <div key={i} className="card h-96 animate-pulse" />)}</div>}

      {matches && (
        <>
          <Group title="For my lost items" icon={Search} matches={forLost} empty="None of your lost reports has a possible match here yet. We check every new found item at every branch." />
          <Group title="For items I found" icon={Package} matches={forFound} empty="None of the items you turned in has a possible owner here yet." />
        </>
      )}
    </>
  );
}

function Group({ title, icon: Icon, matches, empty }: { title: string; icon: typeof Search; matches: MyMatch[]; empty: string }) {
  return (
    <section className="mb-8">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
        <Icon className="h-5 w-5 text-brand" /> {title}
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink-3/40 px-2 text-sm">{matches.length}</span>
      </h2>
      {matches.length === 0
        ? <EmptyState icon={Icon}>{empty}</EmptyState>
        : <div className="grid gap-6 xl:grid-cols-2">{matches.map((m) => <MatchCard key={m.id} m={m} />)}</div>}
    </section>
  );
}

function Mini({ item, mine }: { item: Item; mine: boolean }) {
  return (
    <Link href={`/items/${item.id}`} className="block min-w-0 overflow-hidden rounded-md border border-line bg-panel-2/50 hover:border-brand">
      <div className="h-32 bg-panel-2"><ItemPhoto item={item} /></div>
      <div className="space-y-1 p-3">
        <span className={`chip ${item.type === "LOST" ? "bg-rose-600" : "bg-blue-600"} text-white`}>{item.type === "LOST" ? "Lost" : "Found"}{mine ? " · yours" : ""}</span>
        <p className="truncate font-semibold">{item.title}</p>
        <p className="flex items-center gap-1 truncate text-sm text-ink-3"><MapPin className="h-3.5 w-3.5 shrink-0" /> {item.location || branchName(item.home_branch)}</p>
        <p className="flex items-center gap-1 text-sm text-ink-3"><Calendar className="h-3.5 w-3.5" /> {formatDate(item.event_date)}</p>
      </div>
    </Link>
  );
}

function MatchCard({ m }: { m: MyMatch }) {
  const own = m.side === "LOST" ? m.lost : m.found;
  const open = isActive(own);
  const strong = m.score >= 80;
  const canClaim = m.side === "LOST" && isActive(m.found);
  return (
    <article className={`card flex flex-col border-t-[3px] ${open ? (strong ? "border-t-emerald-500" : "border-t-amber-400") : "border-t-line"}`}>
      <div className="flex items-center gap-3 p-4">
        <ScoreRing score={m.score} size={52} />
        <div>
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {strong ? "Strong match" : "Possible match"}
            {open
              ? <span className="chip bg-amber-400 text-slate-900"><Hourglass className="h-3 w-3" /> Waiting for you</span>
              : <span className="chip bg-ink-3/40 text-ink">Closed · {own.status.toLowerCase()}</span>}
          </p>
          <p className="text-sm text-ink-3">Suggested {formatDate(m.created_at)}</p>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
        <Mini item={m.lost} mine={m.side === "LOST"} />
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-ink-2"><ArrowLeftRight className="h-4 w-4" /></span>
        <Mini item={m.found} mine={m.side === "FOUND"} />
      </div>
      <div className="px-4 pb-4 pt-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Why it matched</p>
        <div className="flex flex-wrap gap-1.5">
          {m.reasons.map((r) => (
            <span key={r.label} className={`chip border font-normal ${r.points ? "border-line bg-white text-slate-800" : "border-line bg-panel-2 text-ink-3"}`}>
              {r.label} <b className={r.points ? "text-emerald-600" : ""}>+{r.points}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Link href={`/items/${m.side === "LOST" ? m.found.id : m.lost.id}`} className="btn-secondary px-3 py-1.5">
          <Eye className="h-4 w-4" /> View {m.side === "LOST" ? "found item" : "owner's report"}
        </Link>
        {canClaim && (
          <Link href={`/items/${m.found.id}#claim`} className="btn-primary ml-auto px-3 py-1.5"><Hand className="h-4 w-4" /> This is mine: claim it</Link>
        )}
        {m.side === "FOUND" && open && <span className="ml-auto text-sm text-ink-3">The owner has been notified.</span>}
      </div>
    </article>
  );
}
