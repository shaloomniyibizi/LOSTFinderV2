"use client";

import { Check, Mail, PackageCheck, Phone, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { timeAgo } from "@/lib/format";
import type { Claim } from "@/lib/types";
import { ClaimBadge } from "./badges";
import { Alert, Spinner } from "./ui";

/** One claim. Staff see the claimant's contact details and the Approve / Reject / Handover buttons. */
export default function ClaimCard({
  claim, staffView = false, showItem = false, onChanged,
}: {
  claim: Claim;
  staffView?: boolean;
  showItem?: boolean;
  onChanged?: (c: Claim) => void;
}) {
  const { api } = useApp();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject" | "handover") {
    setBusy(action);
    setError(null);
    try {
      const updated = await api<Claim>(`/claims/${claim.id}/${action}`, { method: "POST", json: { note: note || null } });
      setNote("");
      onChanged?.(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const canDecide = staffView && claim.status === "PENDING";
  const canHandOver = staffView && claim.status === "APPROVED" && !claim.handed_over_at;

  return (
    <div className="card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {showItem && (
            <Link href={`/items/${claim.item_id}`} className="font-semibold text-ink hover:text-blue-700">
              {claim.item_title ?? "Item"}
            </Link>
          )}
          <p className={`text-sm ${showItem ? "text-ink-2" : "font-semibold text-ink"}`}>
            {staffView || showItem ? `Claimed by ${claim.claimant_name ?? "unknown"}` : "Your claim"} · {timeAgo(claim.created_at)} · {branchName(claim.home_branch)}
          </p>
        </div>
        <ClaimBadge status={claim.status} handedOver={!!claim.handed_over_at} />
      </div>

      {staffView && (claim.claimant_email || claim.claimant_phone) && (
        <div className="flex flex-wrap gap-4 text-sm text-ink-2">
          {claim.claimant_email && <span className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-ink-3" /> {claim.claimant_email}</span>}
          {claim.claimant_phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-ink-3" /> {claim.claimant_phone}</span>}
        </div>
      )}

      <div className="rounded-md bg-panel-2 p-3 text-sm">
        {claim.item_question && <p className="text-ink-2"><b className="font-medium text-ink">Question:</b> {claim.item_question}</p>}
        <p className="mt-1 text-ink"><b className="font-medium">Answer:</b> {claim.answer}</p>
      </div>

      {claim.staff_note && <p className="text-sm text-ink-2"><b className="font-medium">Staff note:</b> {claim.staff_note}</p>}

      {(canDecide || canHandOver) && (
        <div className="space-y-2 border-t border-line pt-3">
          {canDecide && (
            <input className="input" placeholder="Note (optional), e.g. how you checked it" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          )}
          <div className="flex flex-wrap gap-2">
            {canDecide && (
              <>
                <button onClick={() => act("approve")} disabled={!!busy} className="btn bg-emerald-600 text-white hover:bg-emerald-700">
                  {busy === "approve" ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Approve
                </button>
                <button onClick={() => act("reject")} disabled={!!busy} className="btn-secondary text-rose-700 dark:text-rose-300">
                  {busy === "reject" ? <Spinner className="h-4 w-4" /> : <X className="h-4 w-4" />} Reject
                </button>
              </>
            )}
            {canHandOver && (
              <button onClick={() => act("handover")} disabled={!!busy} className="btn-primary">
                {busy === "handover" ? <Spinner className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />} Mark as handed over
              </button>
            )}
          </div>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
