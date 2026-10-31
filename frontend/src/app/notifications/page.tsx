"use client";

import { Bell, CheckCheck, ClipboardCheck, Hand, Link2, Radio } from "lucide-react";
import { useEffect, useMemo } from "react";
import RequireLogin from "@/components/RequireLogin";
import { EmptyState, Hero, PageTitle, TimelineItem } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";

export default function NotificationsPage() {
  return (
    <RequireLogin reason="Log in to see your notifications.">
      <Notifications />
    </RequireLogin>
  );
}

const LOOK = {
  match: { icon: Link2, cls: "bg-amber-400 text-slate-900", label: "Match" },
  claim: { icon: ClipboardCheck, cls: "bg-emerald-600 text-white", label: "Your claim" },
  claim_on_my_item: { icon: Hand, cls: "bg-blue-600 text-white", label: "Claim on your item" },
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function Notifications() {
  const { activity, unread, markAllRead, connected } = useNotifications();
  const groups = useMemo(() => {
    const out: [string, typeof activity][] = [];
    for (const a of activity) {
      const label = dayLabel(a.at);
      const g = out.find(([l]) => l === label);
      if (g) g[1].push(a);
      else out.push([label, [a]]);
    }
    return out;
  }, [activity]);

  // Opening this page counts as reading them (after a short moment, so the "new" marks are seen)
  useEffect(() => {
    const t = setTimeout(markAllRead, 1500);
    return () => clearTimeout(t);
  }, [markAllRead]);

  return (
    <>
      <PageTitle crumbs={[{ label: "Notifications" }]} />
      <Hero tone="teal" icon={Bell} title="Notifications"
        subtitle="Matches for your items and decisions on claims. They arrive live over a WebSocket from the branch you're connected to."
        badges={<span className="chip bg-black/25 text-white"><Radio className="h-3.5 w-3.5" /> {connected ? "Live connection open" : "Reconnecting…"}</span>}
        actions={unread > 0 ? <button onClick={markAllRead} className="btn-light"><CheckCheck className="h-4 w-4" /> Mark {unread} as read</button> : undefined} />

      {activity.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing yet">You&apos;ll be notified here when an item matches yours or a claim is decided.</EmptyState>
      ) : (
        <div className="max-w-3xl">
          {groups.map(([label, list]) => (
            <section key={label} className="mb-2">
              <span className="mb-3 inline-block rounded bg-brand-strong px-2.5 py-1 text-sm font-medium text-white">{label}</span>
              <ul>
                {list.map((a, i) => {
                  const look = LOOK[a.kind] ?? LOOK.claim;
                  return (
                    <TimelineItem key={`${a.at}-${i}`} icon={look.icon} iconCls={look.cls} title={a.title} href={a.link}
                      time={`${look.label} · ${timeAgo(a.at)}`} last={i === list.length - 1}>
                      {a.message}
                    </TimelineItem>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
