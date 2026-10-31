"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/** A centred dialog over the page. Escape or a click outside closes it. */
export default function Modal({ title, subtitle, onClose, children, footer, width = "max-w-lg" }: {
  title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input, select, textarea, button[data-autofocus]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="modal-title"
        className={`card my-8 w-full ${width} overflow-hidden shadow-2xl animate-[pop_.15s_ease-out]`}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="flex-1">
            <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-3 hover:bg-panel-2 hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-panel-2/50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
