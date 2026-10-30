"use client";

import { ImagePlus, X } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validatePhoto(file: File): string | null {
  if (!TYPES.includes(file.type)) return "Please choose a JPEG, PNG or WebP photo.";
  if (file.size > MAX_BYTES) return "The photo is larger than 5 MB. Please choose a smaller one.";
  return null;
}

/** Drag-and-drop or click to choose a photo, with a preview. */
export default function PhotoPicker({
  file, onChange, existingUrl,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  existingUrl?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(f: File | undefined) {
    if (!f) return;
    const problem = validatePhoto(f);
    setError(problem);
    if (!problem) onChange(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files?.[0]);
  }

  const shown = preview ?? existingUrl ?? null;

  return (
    <div>
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative flex min-h-48 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/40"
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        aria-label="Choose a photo"
      >
        {shown ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="Selected photo" className="max-h-72 w-full object-contain" />
            {file && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="absolute right-3 top-3 rounded-full bg-slate-900/70 p-1.5 text-white hover:bg-slate-900"
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
              <ImagePlus className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-slate-700">Drop a photo here, or click to choose</p>
            <p className="text-xs text-slate-500">JPEG, PNG or WebP · up to 5 MB</p>
          </div>
        )}
      </div>
      {file && <p className="mt-2 text-xs text-slate-500">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <input ref={input} type="file" accept={TYPES.join(",")} className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
    </div>
  );
}
