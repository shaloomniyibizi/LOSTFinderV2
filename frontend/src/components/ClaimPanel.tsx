"use client";

import { Clock, HandHelping, Info, LockKeyhole, PackageCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { canEdit, isStaffFor, useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import { useNotifications } from "@/lib/notifications";
import { timeAgo } from "@/lib/format";
import type { Claim, Item, QueuedClaim, QueuedResponse } from "@/lib/types";
import ClaimCard from "./ClaimCard";
import { Alert, Spinner } from "./ui";

/** On a FOUND item's page: claim it as yours, follow your claim, or (staff) decide on claims. */
export default function ClaimPanel({ item, onItemChanged }: { item: Item; onItemChanged: () => void }) {
  const { api, user } = useApp();
  const { liveVersion } = useNotifications();
  const [fetched, setFetched] = useState<Claim[]>([]);
  // A claim we just made is decided at the item's home branch and only reaches THIS branch's copy
  // a moment later, so remember the home branch's answer and show it straight away.
  const [justMade, setJustMade] = useState<Claim | null>(null);
  const [all, setAll] = useState<Claim[] | null>(null);
  const [queued, setQueued] = useState<QueuedClaim[]>([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staff = isStaffFor(user, item.home_branch);
  const isReporter = !!user && item.reported_by === user.id;

  const load = useCallback(() => {
    if (!user) return;
    api<Claim[]>("/claims/mine").then((cs) => setFetched(cs.filter((c) => c.item_id === item.id))).catch(() => {});
    api<QueuedClaim[]>("/claims/queued/mine").then((qs) => setQueued(qs.filter((q) => q.item_id === item.id))).catch(() => {});
    if (staff || isReporter) api<Claim[]>(`/items/${item.id}/claims`).then(setAll).catch(() => setAll([]));
  }, [api, user, item.id, staff, isReporter]);

  useEffect(load, [load, liveVersion, item.version]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<Claim | QueuedResponse>(`/items/${item.id}/claims`, { method: "POST", json: { answer } });
      if (!("queued" in created)) setJustMade(created);
      setAnswer("");
      load();
      onItemChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (item.type !== "FOUND") return null;
  // Merge: the replicated list, plus the claim we just made if its copy hasn't arrived yet (newest version wins)
  const byId = new Map(fetched.map((c) => [c.id, c]));
  if (justMade && (!byId.has(justMade.id) || byId.get(justMade.id)!.version < justMade.version)) byId.set(justMade.id, justMade);
  const mine = [...byId.values()];
  const waiting = queued.filter((q) => q.status === "QUEUED");
  const myActive = mine.find((c) => c.status !== "REJECTED") ?? waiting[0];
  const claimable = item.status === "OPEN" || item.status === "MATCHED";

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><HandHelping className="h-5 w-5 text-indigo-600" /> Is this yours?</h2>

      {item.status === "RETURNED" && (
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <PackageCheck className="h-5 w-5 shrink-0" /> This item has been returned to its owner.
        </div>
      )}

      {/* Your own claim(s) on this item */}
      {mine.map((c) => <ClaimCard key={c.id} claim={c} />)}

      {/* Phase 5: claims waiting for an offline home branch */}
      {queued.filter((q) => q.status !== "DELIVERED" || !mine.length).map((q) => <QueuedCard key={q.id} q={q} />)}

      {/* Form to claim it */}
      {!user && claimable && (
        <div className="card flex items-center justify-between gap-3 p-4 text-sm">
          <span className="flex items-center gap-2 text-slate-600"><LockKeyhole className="h-4 w-4" /> Log in to claim this item.</span>
          <Link href={`/login?next=/items/${item.id}`} className="btn-primary">Log in</Link>
        </div>
      )}
      {user && claimable && !isReporter && !myActive && !staff && (
        <form onSubmit={submit} className="card space-y-3 p-5">
          <p className="text-sm text-slate-600">
            Staff at the <b>{branchName(item.home_branch)}</b> branch will check your answer before handing the item over.
          </p>
          {item.verification_question ? (
            <div className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900"><b>Question:</b> {item.verification_question}</div>
          ) : (
            <p className="text-sm text-slate-500">Describe something only the owner would know (marks, contents, serial number…).</p>
          )}
          <textarea className="input min-h-24" required minLength={5} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)}
            placeholder={item.verification_question ? "Your answer" : "Details that prove it's yours"} />
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : "Claim this item"}</button>
          </div>
        </form>
      )}

      {item.status === "CLAIMED" && !myActive && !staff && !isReporter && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="h-5 w-5 shrink-0" /> Someone has claimed this item and staff are checking it. If their claim is not accepted, you can claim it.
        </div>
      )}

      {/* Staff and the finder see every claim */}
      {(staff || isReporter) && all && all.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">{staff ? "Claims to review" : "Claims on the item you found"}</p>
          {all.map((c) => (
            <ClaimCard key={c.id} claim={c} staffView={staff} onChanged={() => { load(); onItemChanged(); }} />
          ))}
        </div>
      )}
      {(staff || (isReporter && canEdit(user, item))) && all && all.length === 0 && (
        <p className="text-sm text-slate-500">No claims yet.</p>
      )}
    </div>
  );
}


export function QueuedCard({ q }: { q: QueuedClaim }) {
  const where = branchName(q.target_branch);
  if (q.status === "FAILED") {
    return (
      <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <XCircle className="h-5 w-5 shrink-0" />
        <p><b>Your queued claim was not accepted by {where}.</b> {q.last_error}</p>
      </div>
    );
  }
  if (q.status === "DELIVERED") {
    return (
      <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Info className="h-5 w-5 shrink-0" />
        <p>Your claim was delivered to {where} {q.delivered_at ? timeAgo(q.delivered_at) : ""}. Its status will appear here in a moment.</p>
      </div>
    );
  }
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Clock className="h-5 w-5 shrink-0 animate-pulse" />
      <div>
        <p className="font-semibold">Claim queued: {where} is offline</p>
        <p className="mt-0.5">
          Your claim is saved here and will be sent to {where} automatically as soon as it is back. You don&apos;t need to do anything.
        </p>
        <p className="mt-1 text-xs text-amber-700">Saved {timeAgo(q.created_at)} · delivery attempts: {q.attempts}</p>
      </div>
    </div>
  );
}
