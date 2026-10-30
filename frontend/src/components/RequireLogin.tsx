"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "@/lib/app-context";
import { Spinner } from "./ui";

/** Shows its children only to logged-in users; otherwise a friendly prompt to log in. */
export default function RequireLogin({ children, reason }: { children: ReactNode; reason: string }) {
  const { user, ready } = useApp();
  const pathname = usePathname();

  if (!ready) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Spinner />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="card p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <LockKeyhole className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold">Please log in</h1>
          <p className="mt-2 text-sm text-slate-500">{reason}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-primary">Log in</Link>
            <Link href={`/register?next=${encodeURIComponent(pathname)}`} className="btn-secondary">Create account</Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
