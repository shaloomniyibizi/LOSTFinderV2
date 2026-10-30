import { CheckCircle2, CircleDot, HandHelping, Search, Sparkles } from "lucide-react";
import { branchName } from "@/lib/branches";
import type { ItemStatus, ItemType } from "@/lib/types";

export function TypeBadge({ type, className = "" }: { type: ItemType; className?: string }) {
  return type === "LOST" ? (
    <span className={`chip bg-amber-100 text-amber-800 ring-1 ring-amber-200 ${className}`}>
      <Search className="h-3 w-3" /> Lost
    </span>
  ) : (
    <span className={`chip bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 ${className}`}>
      <HandHelping className="h-3 w-3" /> Found
    </span>
  );
}

const STATUS: Record<ItemStatus, { label: string; cls: string; Icon: typeof CircleDot }> = {
  OPEN: { label: "Open", cls: "bg-sky-50 text-sky-700 ring-sky-200", Icon: CircleDot },
  MATCHED: { label: "Matched", cls: "bg-violet-50 text-violet-700 ring-violet-200", Icon: Sparkles },
  CLAIMED: { label: "Claimed", cls: "bg-orange-50 text-orange-700 ring-orange-200", Icon: HandHelping },
  RETURNED: { label: "Returned", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  const s = STATUS[status];
  return (
    <span className={`chip ring-1 ${s.cls}`}>
      <s.Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

export function BranchChip({ id }: { id: string }) {
  return (
    <span className="chip bg-slate-100 text-slate-600 ring-1 ring-slate-200" title={`Home branch: ${branchName(id)}`}>
      {branchName(id)}
    </span>
  );
}
