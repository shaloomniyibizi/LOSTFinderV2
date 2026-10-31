"use client";

import {
  Calendar, Camera, CheckCircle2, LayoutGrid, Lightbulb, ListOrdered, MapPin, Package, Palette, Search, Send, ShieldCheck, Tag, Type,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, Suspense, useEffect, useState } from "react";
import PhotoPicker from "@/components/PhotoPicker";
import RequireLogin from "@/components/RequireLogin";
import { Alert, Hero, PageTitle, Spinner } from "@/components/ui";
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

function Section({ icon: Icon, title, hint, children }: { icon: typeof Tag; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-line px-5 py-5 last:border-0 sm:px-6">
      <legend className="sr-only">{title}</legend>
      <p className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-2">
        <Icon className="h-4 w-4 text-brand" /> {title} {hint && <span className="font-normal normal-case tracking-normal text-ink-3">{hint}</span>}
      </p>
      {children}
    </fieldset>
  );
}

function Field({ id, label, required, icon: Icon, children, help }: { id: string; label: string; required?: boolean; icon: typeof Tag; children: ReactNode; help?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label} {required && <span className="text-rose-500">*</span>}</label>
      <div className="flex">
        <span className="flex items-center rounded-l-md border border-r-0 border-line bg-panel-2 px-3 text-ink-2"><Icon className="h-4 w-4" /></span>
        <div className="flex-1 [&>*]:rounded-l-none">{children}</div>
      </div>
      {help && <p className="mt-1 text-xs text-ink-3">{help}</p>}
    </div>
  );
}

function ReportForm() {
  const { api, branch } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<ItemType>(params.get("type") === "FOUND" ? "FOUND" : "LOST");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [colour, setColour] = useState("");
  const [eventDate, setEventDate] = useState(todayIso());
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setType(params.get("type") === "FOUND" ? "FOUND" : "LOST");
    if (params.get("category")) setCategory(params.get("category")!);
  }, [params]);

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
    <>
      <PageTitle crumbs={[{ label: isLost ? "Lost items" : "Found items", href: isLost ? "/lost" : "/found" }, { label: "New report" }]} />
      <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
        <form onSubmit={onSubmit} className="card overflow-hidden">
          <Hero flat tone={isLost ? "orange" : "blue"} icon={isLost ? Search : Package}
              title={isLost ? "Report a lost item" : "Turn in a found item"}
              subtitle={isLost
                ? "Describe what you lost. We compare it with every item handed in at all branches and tell you about likely matches."
                : "Thank you for helping! Describe what you found so the owner can recognise it."}
              actions={<Link href={`/report?type=${isLost ? "FOUND" : "LOST"}`} className="btn-outline-light">
                {isLost ? "I found something instead" : "I lost something instead"}
              </Link>} />
          <div>
            <Section icon={Tag} title="The item">
              <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <Field id="title" label={isLost ? "What did you lose?" : "What did you find?"} required icon={Type}>
                  <input id="title" className="input" required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder={isLost ? "e.g. Black laptop bag" : "e.g. Blue Samsung phone"} />
                </Field>
                <Field id="category" label="Category" required icon={LayoutGrid}>
                  <select id="category" className="input" required value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="" disabled>Choose a category</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <div>
                  <label className="label" htmlFor="description">Identifying details</label>
                  <textarea id="description" className="input min-h-28" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder={isLost
                      ? "Colour, brand, size, stickers, scratches, what was inside… the more specific, the better the match."
                      : "Describe it, but leave out one detail so the real owner can prove it's theirs."} />
                  <p className="mt-1 text-right text-xs text-ink-3">{description.length} / 1000</p>
                </div>
                <Field id="colour" label="Main colour" icon={Palette} help="Leave as “Not sure” if you don't know.">
                  <select id="colour" className="input" value={colour} onChange={(e) => setColour(e.target.value)}>
                    <option value="">Not sure</option>
                    {COLOURS.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
                  </select>
                </Field>
              </div>
            </Section>

            <Section icon={MapPin} title="Where & when">
              <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <Field id="location" label={isLost ? "Where did you lose it?" : "Where did you find it?"} icon={MapPin} help="Building, room or area. Your best guess is fine.">
                  <input id="location" className="input" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main library, 2nd floor" />
                </Field>
                <Field id="date" label={isLost ? "When did you lose it?" : "When did you find it?"} required icon={Calendar}>
                  <input id="date" type="date" className="input" required max={todayIso()} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                </Field>
              </div>
            </Section>

            {!isLost && (
              <Section icon={ShieldCheck} title="Proof of ownership" hint="(recommended)">
                <Field id="question" label="Question for the owner" icon={ShieldCheck}
                  help="Anyone who claims the item must answer it. Staff compare the answer before handing it over, so don't put the answer in the description.">
                  <input id="question" className="input" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. What sticker is on the lid? What is the wallpaper?" />
                </Field>
              </Section>
            )}

            <Section icon={Camera} title="Photo" hint="(optional)">
              <PhotoPicker file={photo} onChange={setPhoto} />
            </Section>

            {error && <div className="px-6 pb-4"><Alert>{error}</Alert></div>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
              <span className="text-sm text-ink-3"><span className="text-rose-500">*</span> Required · saved at the <b className="text-ink-2">{branch.name}</b> branch</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => router.back()} className="btn-secondary">Cancel</button>
                <button className={isLost ? "btn-warning px-5" : "btn-primary px-5"} disabled={!!busy}>
                  {busy ? <><Spinner className="h-4 w-4" /> {busy}</> : <><Send className="h-4 w-4" /> {isLost ? "Submit lost report" : "Turn in found item"}</>}
                </button>
              </div>
            </div>
          </div>
        </form>

        <aside className="space-y-6">
          <div className="card">
            <div className="card-header"><Lightbulb className="h-4 w-4 text-amber-500" /> Tips for a good report</div>
            <ul className="divide-y divide-line text-sm">
              {(isLost
                ? ["Name the brand, colour and size.", "Mention stickers, scratches, cases or keyrings.", "Add a photo of the item, or a similar one, if you have it."]
                : ["Say exactly where you found it.", "Add a clear photo, but hide personal details (ID numbers).", "Hand valuables to the branch desk the same day."]
              ).map((t) => (
                <li key={t} className="flex gap-2 px-4 py-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {t}</li>
              ))}
              <li className="flex gap-2 px-4 py-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{isLost
                  ? <><b>Keep one secret detail</b> (serial number, lock screen, contents) to prove ownership when you claim.</>
                  : <><b>Ask a question</b> only the owner can answer, so the item goes back to the right person.</>}</span>
              </li>
            </ul>
          </div>
          <div className="card">
            <div className="card-header"><ListOrdered className="h-4 w-4 text-brand" /> What happens next</div>
            <ol className="list-decimal space-y-2 py-4 pl-9 pr-4 text-sm marker:font-semibold marker:text-brand">
              {isLost ? <>
                <li>Your report is copied to all three branches within a second.</li>
                <li>We match it against every found item, now and as new ones arrive.</li>
                <li>Review suggestions in <Link href="/matches" className="text-brand underline">My matches</Link>.</li>
                <li>Claim the item with your secret detail; staff verify it.</li>
                <li>Collect it at the branch with your ID.</li>
              </> : <>
                <li>Your report is copied to all three branches.</li>
                <li>People who lost something similar are notified immediately.</li>
                <li>The owner claims it by answering your question.</li>
                <li>Staff at the {branch.name} branch check the answer and hand it over.</li>
              </>}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}
