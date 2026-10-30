"use client";

import { BellRing, HandHelping, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/lib/notifications";

/** Pop-up messages for live notifications (top right). Click one to open the related page. */
export default function Toaster() {
  const { toasts, dismiss } = useNotifications();
  const router = useRouter();
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-3" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === "match" ? Sparkles : t.kind === "claim" ? HandHelping : BellRing;
        const color = t.kind === "match" ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700";
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl transition hover:border-slate-300"
            onClick={() => {
              if (t.link) router.push(t.link);
              dismiss(t.id);
            }}
            role="status"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              <p className="mt-0.5 text-sm text-slate-600">{t.message}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.id);
              }}
              className="h-6 w-6 shrink-0 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dismiss"
            >
              <X className="mx-auto h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
