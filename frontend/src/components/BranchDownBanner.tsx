"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { BRANCHES } from "@/lib/branches";
import { useNotifications } from "@/lib/notifications";
import { useBranchHealth } from "@/lib/use-branch-health";

/** How many heartbeats in a row the current branch must miss before switching automatically. */
const MISSES_BEFORE_FAILOVER = 2;

/**
 * Automatic failover (Phase 5): if the branch you are using stops answering its heartbeat,
 * switch to a branch that is up. Every branch has a copy of all items, so you can keep working.
 * If no branch is up, show a banner instead.
 */
export default function BranchDownBanner() {
  const { branch, setBranchId } = useApp();
  const { pushToast } = useNotifications();
  const health = useBranchHealth();
  const misses = useRef(0);

  useEffect(() => {
    if (!health) return;
    if (health[branch.id]?.online !== false) {
      misses.current = 0;
      return;
    }
    misses.current += 1;
    if (misses.current < MISSES_BEFORE_FAILOVER) return;
    const alternative = BRANCHES.find((b) => b.id !== branch.id && health[b.id]?.online);
    if (alternative) {
      misses.current = 0;
      setBranchId(alternative.id);
      pushToast({
        kind: "info",
        title: `Switched to ${alternative.name}`,
        message: `${branch.name} is not responding. You are now using ${alternative.name}, which has a copy of every item.`,
      });
    }
  }, [health, branch.id, branch.name, setBranchId, pushToast]);

  if (!health || health[branch.id]?.online !== false) return null;
  const alternatives = BRANCHES.filter((b) => b.id !== branch.id && health[b.id]?.online);

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-6">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-amber-900 dark:text-amber-300">
          <b>{branch.name}</b> branch is not responding.{" "}
          {alternatives.length
            ? "Switching to another branch automatically…"
            : "No other branch is reachable either. Check that the system is running."}
        </p>
        <div className="flex gap-2">
          {alternatives.map((b) => (
            <button key={b.id} onClick={() => setBranchId(b.id)} className="btn bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700">
              Switch to {b.name} now
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
