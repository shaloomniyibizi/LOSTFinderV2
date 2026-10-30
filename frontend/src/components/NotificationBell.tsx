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
        {connected ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5 text-slate-400" />}
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <span className={`chip ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-400"}`} />
              {connected ? "Live" : "Reconnecting…"}
            </span>
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center text-sm text-slate-500">
                <Inbox className="mb-2 h-6 w-6 text-slate-400" />
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
                    className="flex gap-3 border-b border-slate-50 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.kind === "match" ? "bg-violet-50 text-violet-600" : "bg-indigo-50 text-indigo-600"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">{a.title}</span>
                      <span className="mt-0.5 block text-sm text-slate-600">{a.message}</span>
                      <span className="mt-1 block text-xs text-slate-400">{timeAgo(a.at)}</span>
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
