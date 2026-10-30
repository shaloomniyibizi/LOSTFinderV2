import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold">This page got lost too</h1>
      <p className="mt-2 text-slate-500">The page you are looking for doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary mt-6">Back to home</Link>
    </div>
  );
}
