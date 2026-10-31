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
        const color = t.kind === "match" ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-blue-500/15 text-blue-700 dark:text-blue-300";
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex cursor-pointer gap-3 rounded-lg border border-line bg-panel p-4 shadow-xl transition hover:border-line"
            onClick={() => {
              if (t.link) router.push(t.link);
              dismiss(t.id);
            }}
            role="status"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${color}`}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              <p className="mt-0.5 text-sm text-ink-2">{t.message}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.id);
              }}
              className="h-6 w-6 shrink-0 rounded-md text-ink-3 hover:bg-panel-2 hover:text-ink"
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
