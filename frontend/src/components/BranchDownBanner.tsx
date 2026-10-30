"use client";

import { WifiOff } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { BRANCHES } from "@/lib/branches";
import { useBranchHealth } from "@/lib/use-branch-health";

/** If the current branch stops answering its heartbeat, offer to switch to a branch that is up. */
export default function BranchDownBanner() {
  const { branch, setBranchId } = useApp();
  const health = useBranchHealth();
  if (!health || health[branch.id]?.online !== false) return null;

  const alternatives = BRANCHES.filter((b) => b.id !== branch.id && health[b.id]?.online);

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-6">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-amber-900">
          <b>{branch.name}</b> branch is not responding.{" "}
          {alternatives.length
            ? "Every branch has a copy of all items, so you can keep working from another branch:"
            : "No other branch is reachable either. Check that the system is running."}
        </p>
        <div className="flex gap-2">
          {alternatives.map((b) => (
            <button key={b.id} onClick={() => setBranchId(b.id)} className="btn bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700">
              Switch to {b.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
