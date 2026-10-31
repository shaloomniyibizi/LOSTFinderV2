"use client";

import { Building2, Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/app-context";
import { BRANCHES } from "@/lib/branches";
import { useBranchHealth } from "@/lib/use-branch-health";

/** Dropdown to choose which branch office the browser talks to. Shows which branches are online. */
export default function BranchSwitcher({ full = false }: { full?: boolean }) {
  const { branch, setBranchId } = useApp();
  const health = useBranchHealth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const dot = (id: string) => {
    const h = health?.[id];
    if (!h) return "bg-ink-3";
    return h.online ? "bg-emerald-500" : "bg-rose-500";
  };

  return (
    <div ref={ref} className={`relative ${full ? "w-full" : ""}`}>
      <button onClick={() => setOpen(!open)} className={`btn-ghost ${full ? "w-full justify-between" : ""}`} aria-haspopup="listbox" aria-expanded={open}>
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-ink-2" />
          <span className={`h-2 w-2 rounded-full ${dot(branch.id)}`} />
          {branch.name}
        </span>
        <ChevronDown className="h-4 w-4 text-ink-3" />
      </button>
      {open && (
        <div className={`absolute z-50 mt-2 w-72 rounded-lg border border-line bg-panel p-1.5 shadow-xl ${full ? "left-0" : "right-0"}`} role="listbox">
          <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Connected branch</p>
          {BRANCHES.map((b) => {
            const h = health?.[b.id];
            return (
              <button
                key={b.id}
                role="option"
                aria-selected={b.id === branch.id}
                onClick={() => {
                  setBranchId(b.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-panel-2"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot(b.id)}`} />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {b.name} <span className="font-normal text-ink-3">· Branch {b.id}</span>
                  </span>
                  <span className="block text-xs text-ink-2">
                    {h ? (h.online ? `Online · ${h.ms} ms` : "Offline") : "Checking…"}
                  </span>
                </span>
                {b.id === branch.id && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
