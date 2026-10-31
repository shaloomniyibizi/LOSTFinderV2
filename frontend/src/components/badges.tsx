import { CheckCircle2, CircleDot, HandHelping, Search, Sparkles } from "lucide-react";
import { branchName } from "@/lib/branches";
import type { ItemStatus, ItemType } from "@/lib/types";

export function TypeBadge({ type, className = "" }: { type: ItemType; className?: string }) {
  return type === "LOST" ? (
    <span className={`chip bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/30 ${className}`}>
      <Search className="h-3 w-3" /> Lost
    </span>
  ) : (
    <span className={`chip bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/30 ${className}`}>
      <HandHelping className="h-3 w-3" /> Found
    </span>
  );
}

const STATUS: Record<ItemStatus, { label: string; cls: string; Icon: typeof CircleDot }> = {
  OPEN: { label: "Open", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30", Icon: CircleDot },
  MATCHED: { label: "Matched", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/30", Icon: Sparkles },
  CLAIMED: { label: "Claimed", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-500/30", Icon: HandHelping },
  RETURNED: { label: "Returned", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30", Icon: CheckCircle2 },
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  const s = STATUS[status];
  return (
    <span className={`chip ring-1 ${s.cls}`}>
      <s.Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

export function ClaimBadge({ status, handedOver }: { status: "PENDING" | "APPROVED" | "REJECTED"; handedOver?: boolean }) {
  if (handedOver) return <span className="chip bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"><CheckCircle2 className="h-3 w-3" /> Handed over</span>;
  const s = {
    PENDING: { label: "Being checked", cls: "bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-amber-500/30" },
    APPROVED: { label: "Approved: ready to collect", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30" },
    REJECTED: { label: "Not accepted", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30" },
  }[status];
  return <span className={`chip ring-1 ${s.cls}`}>{s.label}</span>;
}

export function BranchChip({ id }: { id: string }) {
  return (
    <span className="chip bg-panel-2 text-ink-2 ring-1 ring-line" title={`Home branch: ${branchName(id)}`}>
      {branchName(id)}
    </span>
  );
}
