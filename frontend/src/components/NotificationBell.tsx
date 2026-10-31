"use client";

import { Bell, BellOff, HandHelping, Inbox, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";

export default function NotificationBell() {
  const { activity, unread, markAllRead, connected } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggle() {
    if (!open) markAllRead();
    setOpen(!open);
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} className="btn-ghost relative px-2.5" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
        {connected ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5 text-ink-3" />}
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <span className={`chip ${connected ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-panel-2 text-ink-2"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-400"}`} />
              {connected ? "Live" : "Reconnecting…"}
            </span>
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center text-sm text-ink-2">
                <Inbox className="mb-2 h-6 w-6 text-ink-3" />
                Nothing yet. You&apos;ll hear here when an item matches yours or a claim is decided.
              </div>
            ) : (
              activity.map((a, i) => {
                const Icon = a.kind === "match" ? Sparkles : HandHelping;
                return (
                  <Link
                    key={`${a.link}-${a.at}-${i}`}
                    href={a.link}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 border-b border-line px-4 py-3 hover:bg-panel-2"
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.kind === "match" ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{a.title}</span>
                      <span className="mt-0.5 block text-sm text-ink-2">{a.message}</span>
                      <span className="mt-1 block text-xs text-ink-3">{timeAgo(a.at)}</span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
