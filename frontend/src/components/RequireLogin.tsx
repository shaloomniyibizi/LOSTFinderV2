"use client";

import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "@/lib/app-context";
import { useAuthModal } from "@/lib/auth-modal";
import { Spinner } from "./ui";

/** Shows its children only to logged-in users; otherwise a friendly prompt to log in. */
export default function RequireLogin({ children, reason }: { children: ReactNode; reason: string }) {
  const { user, ready } = useApp();
  const { openAuth } = useAuthModal();

  if (!ready) {
    return (
      <div className="flex justify-center py-24 text-ink-3">
        <Spinner />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="card p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <LockKeyhole className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold">Please sign in</h1>
          <p className="mt-2 text-sm text-ink-2">{reason}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => openAuth("login")} className="btn-primary">Sign in</button>
            <button onClick={() => openAuth("register")} className="btn-secondary">Create account</button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
