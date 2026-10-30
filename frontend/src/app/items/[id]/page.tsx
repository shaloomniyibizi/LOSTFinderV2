"use client";

import {
  ArrowLeft, ArrowLeftRight, CalendarDays, Camera, Clock, Copy, GitBranch, ImageOff, MapPin, Pencil, Tag,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, Suspense, useCallback, useEffect, useState } from "react";
import { BranchChip, StatusBadge, TypeBadge } from "@/components/badges";
import CategoryIcon from "@/components/CategoryIcon";
import PhotoPicker from "@/components/PhotoPicker";
import { Alert, EmptyState, Spinner } from "@/components/ui";
import { ApiError, isOffline, photoUrl } from "@/lib/api";
import { canEdit, isStaffFor, useApp } from "@/lib/app-context";
import { branchName, CATEGORIES, COLOURS } from "@/lib/branches";
import { capitalize, formatDate, timeAgo, todayIso } from "@/lib/format";
import type { Item, ItemStatus } from "@/lib/types";

export default function ItemPage() {
  return (
    <Suspense fallback={null}>
      <ItemView />
    </Suspense>
  );
}

function ItemView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { api, branch, user, setBranchId } = useApp();
  const [item, setItem] = useState<Item | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(params.get("created") ? "created" : null);

  const load = useCallback(async () => {
    setError(null);
    // A report made a moment ago at another branch may still be on its way: retry a few times.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const it = await api<Item>(`/items/${id}`);
        setItem(it);
        setNotFound(false);
        return;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(isOffline(err) ? `${branch.name} branch is not reachable. Try another branch from the menu at the top.` : (err as Error).message);
        return;
      }
    }
  }, [api, id, branch.name]);

  useEffect(() => {
    setItem(null);
    setBroken(false);
    load();
  }, [load]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState icon={ImageOff} title="Item not found">
          It may have been removed. <Link href="/search" className="font-semibold text-indigo-600">Browse all items</Link>
        </EmptyState>
      </div>
    );
  }
  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6"><Alert>{error}</Alert></div>;
  }
  if (!item) {
    return <div className="flex justify-center py-32 text-slate-400"><Spinner className="h-6 w-6" /></div>;
  }

  const src = photoUrl(branch.url, item.photo_hash);
  const atHome = branch.id === item.home_branch;
  const editable = canEdit(user, item);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/search" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to all items
      </Link>

      {notice === "created" && (
        <div className="mt-4">
          <Alert kind="success">
            <b>Your report is saved</b> at the {branchName(item.home_branch)} branch and is being shared with every branch.
            <button onClick={() => setNotice(null)} className="ml-2 font-semibold underline">Dismiss</button>
          </Alert>
        </div>
      )}
      {params.get("photo_error") && (
        <div className="mt-4">
          <Alert>The report was saved, but the photo could not be uploaded: {params.get("photo_error")} You can add it below.</Alert>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Photo */}
        <div className="card self-start overflow-hidden">
          <div className="flex aspect-[4/3] items-center justify-center bg-slate-100">
            {src && !broken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={item.title} onError={() => setBroken(true)} className="h-full w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <CategoryIcon category={item.category} className="h-16 w-16" />
                <span className="text-sm">{broken ? "The photo can't be loaded right now" : "No photo yet"}</span>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={item.type} />
              <StatusBadge status={item.status} />
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">{item.title}</h1>
            <p className="mt-1 text-sm text-slate-500">Reported {timeAgo(item.created_at)}</p>
          </div>

          <dl className="card grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm">
            <Meta Icon={Tag} label="Category" value={capitalize(item.category)} />
            <Meta Icon={Tag} label="Colour" value={item.colour ? capitalize(item.colour) : "Not given"} />
            <Meta Icon={CalendarDays} label={item.type === "LOST" ? "Lost on" : "Found on"} value={formatDate(item.event_date)} />
            <Meta Icon={MapPin} label="Location" value={item.location || "Not given"} />
            <Meta Icon={GitBranch} label="Home branch" value={<BranchChip id={item.home_branch} />} />
            <Meta Icon={Clock} label="Last updated" value={timeAgo(item.updated_at)} />
          </dl>

          {item.description && (
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Description</h2>
              <p className="mt-1.5 whitespace-pre-line text-slate-600">{item.description}</p>
            </div>
          )}

          {/* Replication info: which copy you're looking at */}
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <Copy className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>
              {atHome ? (
                <>You are viewing the <b>original</b> at its home branch, {branch.name}. Version {item.version}.</>
              ) : (
                <>You are viewing <b>{branch.name}&apos;s copy</b> of an item owned by the {branchName(item.home_branch)} branch. Version {item.version}.</>
              )}
            </p>
          </div>

          {editable && !atHome && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
              <p>
                Changes to this item are made at its home branch, <b>{branchName(item.home_branch)}</b>, which keeps every copy consistent.
              </p>
              <button onClick={() => setBranchId(item.home_branch)} className="btn-primary mt-3">
                <ArrowLeftRight className="h-4 w-4" /> Switch to {branchName(item.home_branch)}
              </button>
            </div>
          )}

          {editable && atHome && !editing && (
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setEditing(true)} className="btn-secondary">
                <Pencil className="h-4 w-4" /> Edit details
              </button>
            </div>
          )}

          {editable && atHome && isStaffFor(user, item.home_branch) && <StatusControl item={item} onSaved={setItem} />}
        </div>
      </div>

      {editable && atHome && (
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          {editing && <EditForm item={item} onSaved={(it) => { setItem(it); setEditing(false); }} onCancel={() => setEditing(false)} />}
          <PhotoUpload item={item} onSaved={(it) => { setItem(it); setBroken(false); }} />
        </div>
      )}
    </div>
  );
}

function Meta({ Icon, label, value }: { Icon: typeof Tag; label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="mt-1 font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function StatusControl({ item, onSaved }: { item: Item; onSaved: (it: Item) => void }) {
  const { api } = useApp();
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api<Item>(`/items/${item.id}`, { method: "PATCH", json: { status } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-slate-900">Staff: update status</p>
      <div className="mt-3 flex gap-2">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
          {(["OPEN", "MATCHED", "CLAIMED", "RETURNED"] as const).map((s) => (
            <option key={s} value={s}>{capitalize(s.toLowerCase())}</option>
          ))}
        </select>
        <button onClick={save} disabled={busy || status === item.status} className="btn-primary">
          {busy ? <Spinner className="h-4 w-4" /> : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function EditForm({ item, onSaved, onCancel }: { item: Item; onSaved: (it: Item) => void; onCancel: () => void }) {
  const { api } = useApp();
  const [form, setForm] = useState({
    title: item.title, category: item.category, colour: item.colour ?? "", event_date: item.event_date,
    location: item.location, description: item.description,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await api<Item>(`/items/${item.id}`, { method: "PATCH", json: { ...form, colour: form.colour || null } }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      <h2 className="font-semibold">Edit details</h2>
      <div>
        <label className="label">Title</label>
        <input className="input" required minLength={2} value={form.title} onChange={set("title")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={set("category")}>
            {Array.from(new Set([...CATEGORIES, item.category])).map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Colour</label>
          <select className="input" value={form.colour} onChange={set("colour")}>
            <option value="">Not sure</option>
            {Array.from(new Set([...COLOURS, ...(item.colour ? [item.colour] : [])])).map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" max={todayIso()} value={form.event_date} onChange={set("event_date")} />
        </div>
        <div>
          <label className="label">Location</label>
          <input className="input" value={form.location} onChange={set("location")} />
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input min-h-24" value={form.description} onChange={set("description")} />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : "Save changes"}</button>
      </div>
    </form>
  );
}

function PhotoUpload({ item, onSaved }: { item: Item; onSaved: (it: Item) => void }) {
  const { api } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const updated = await api<Item>(`/items/${item.id}/photo`, { method: "POST", form, timeoutMs: 30000 });
      onSaved(updated);
      setFile(null);
      setMessage({ kind: "success", text: "Photo saved. Every branch can now show it." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <h2 className="flex items-center gap-2 font-semibold"><Camera className="h-4 w-4" /> {item.photo_hash ? "Replace photo" : "Add a photo"}</h2>
      <PhotoPicker file={file} onChange={setFile} />
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <div className="flex justify-end">
        <button onClick={upload} disabled={!file || busy} className="btn-primary">
          {busy ? <><Spinner className="h-4 w-4" /> Uploading…</> : "Upload photo"}
        </button>
      </div>
    </div>
  );
}
