"use client";

import { HandHelping, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import PhotoPicker from "@/components/PhotoPicker";
import RequireLogin from "@/components/RequireLogin";
import { Alert, Spinner } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { CATEGORIES, COLOURS } from "@/lib/branches";
import { capitalize, todayIso } from "@/lib/format";
import type { Item, ItemType } from "@/lib/types";

export default function ReportPage() {
  return (
    <RequireLogin reason="You need an account to report an item, so branch staff can contact you about it.">
      <Suspense fallback={null}>
        <ReportForm />
      </Suspense>
    </RequireLogin>
  );
}

function ReportForm() {
  const { api, branch } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<ItemType>(params.get("type") === "FOUND" ? "FOUND" : "LOST");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [colour, setColour] = useState("");
  const [eventDate, setEventDate] = useState(todayIso());
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("Saving your report…");
    try {
      const item = await api<Item>("/items", {
        method: "POST",
        json: {
          type, title, category, colour: colour || null, event_date: eventDate, location, description,
          verification_question: type === "FOUND" ? question.trim() || null : null,
        },
      });
      if (photo) {
        setBusy("Uploading the photo…");
        const form = new FormData();
        form.append("file", photo);
        try {
          await api<Item>(`/items/${item.id}/photo`, { method: "POST", form, timeoutMs: 30000 });
        } catch (err) {
          // The report itself is saved; let the user retry the photo from the item page
          router.push(`/items/${item.id}?created=1&photo_error=${encodeURIComponent((err as Error).message)}`);
          return;
        }
      }
      router.push(`/items/${item.id}?created=1`);
    } catch (err) {
      setError(isOffline(err) ? `${branch.name} branch is not reachable. Switch to another branch at the top and try again.` : (err as Error).message);
      setBusy(null);
    }
  }

  const isLost = type === "LOST";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Report an item</h1>
      <p className="mt-1.5 text-slate-500">
        Your report is saved at the <b className="text-slate-700">{branch.name}</b> branch and shared with all branches.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { v: "LOST" as const, title: "I lost something", text: "Let others know what you're looking for", Icon: Search, on: "border-amber-400 bg-amber-50 ring-amber-200", icon: "bg-amber-100 text-amber-700" },
            { v: "FOUND" as const, title: "I found something", text: "Help the owner get their item back", Icon: HandHelping, on: "border-emerald-400 bg-emerald-50 ring-emerald-200", icon: "bg-emerald-100 text-emerald-700" },
          ].map((o) => (
            <button
              type="button"
              key={o.v}
              onClick={() => setType(o.v)}
              className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
                type === o.v ? `${o.on} ring-4` : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              aria-pressed={type === o.v}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${o.icon}`}>
                <o.Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-900">{o.title}</span>
                <span className="block text-sm text-slate-500">{o.text}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="card space-y-5 p-6">
          <div>
            <label className="label" htmlFor="title">What is it?</label>
            <input id="title" className="input" required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={isLost ? "e.g. Black HP laptop in a grey sleeve" : "e.g. Blue Samsung phone with cracked screen"} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">Category</label>
              <select id="category" className="input" required value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="" disabled>Choose a category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="colour">Main colour <span className="font-normal text-slate-400">(optional)</span></label>
              <select id="colour" className="input" value={colour} onChange={(e) => setColour(e.target.value)}>
                <option value="">Not sure</option>
                {COLOURS.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="date">{isLost ? "When did you lose it?" : "When did you find it?"}</label>
              <input id="date" type="date" className="input" required max={todayIso()} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="location">{isLost ? "Where did you lose it?" : "Where did you find it?"}</label>
              <input id="location" className="input" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Library, 2nd floor" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea id="description" className="input min-h-28" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={isLost
                ? "Brand, model, stickers, scratches, what was inside… Keep one detail secret so you can prove it's yours."
                : "Describe it, but leave out one detail so the real owner can prove it's theirs."} />
          </div>
          {!isLost && (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
              <label className="label" htmlFor="question">Question for the owner <span className="font-normal text-slate-400">(recommended)</span></label>
              <input id="question" className="input" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What sticker is on the lid? What is the phone's wallpaper?" />
              <p className="mt-1.5 text-xs text-slate-500">
                Anyone who claims the item must answer it. Staff compare the answer before handing the item over, so don&apos;t put the answer in the description.
              </p>
            </div>
          )}
          <div>
            <span className="label">Photo <span className="font-normal text-slate-400">(optional, but helps a lot)</span></span>
            <PhotoPicker file={photo} onChange={setPhoto} />
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-ghost">Cancel</button>
          <button className="btn-primary px-6" disabled={!!busy}>
            {busy ? (<><Spinner className="h-4 w-4" /> {busy}</>) : isLost ? "Report lost item" : "Report found item"}
          </button>
        </div>
      </form>
    </div>
  );
}
