"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import HomePage from "../page";
import { useApp } from "@/lib/app-context";
import { useAuthModal } from "@/lib/auth-modal";

/** /register still works as a link: it shows the home page with the sign-up window open. */
export default function Page() {
  return (
    <>
      <HomePage />
      <Suspense fallback={null}><Open /></Suspense>
    </>
  );
}

function Open() {
  const { openAuth } = useAuthModal();
  const { user, ready } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (!ready) return;
    const next = params.get("next") ?? undefined;
    if (user) router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    else openAuth("register", next);
  }, [openAuth, params, ready, user, router]);
  return null;
}
