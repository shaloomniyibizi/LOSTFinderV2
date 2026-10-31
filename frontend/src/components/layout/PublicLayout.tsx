"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useAuthModal } from "@/lib/auth-modal";
import BranchDownBanner from "../BranchDownBanner";
import BranchSwitcher from "../BranchSwitcher";
import Logo from "./Logo";
import { ThemeMenu } from "./Topbar";

const LINKS = [
  { href: "/lost", label: "Lost items" },
  { href: "/found", label: "Found items" },
  { href: "/#how", label: "How it works" },
  { href: "/status", label: "Network status" },
];

/** Layout for visitors who are not signed in: a top bar, the page, a footer. No sidebar. */
export default function PublicLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { openAuth } = useAuthModal();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2"><Logo /> <span className="text-lg font-semibold">LostFinder</span></Link>
          <div className="hidden gap-5 text-sm md:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={pathname === l.href ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}>{l.label}</Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden sm:block"><BranchSwitcher /></span>
            <ThemeMenu />
            <button onClick={() => openAuth("login")} className="btn-ghost text-brand">Sign in</button>
            <button onClick={() => openAuth("register")} className="btn-primary hidden sm:inline-flex">Register</button>
            <button onClick={() => setOpen(!open)} className="btn-ghost px-2 md:hidden" aria-label="Menu" aria-expanded={open}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>
        {open && (
          <div className="border-t border-line px-4 pb-4 pt-2 md:hidden">
            {LINKS.map((l) => <Link key={l.href} href={l.href} className="block rounded-md px-3 py-2.5 text-ink-2 hover:bg-panel-2 hover:text-ink">{l.label}</Link>)}
            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <BranchSwitcher />
              <button onClick={() => openAuth("register")} className="btn-primary">Register</button>
            </div>
          </div>
        )}
      </header>
      <BranchDownBanner />
      <main className={`mx-auto w-full max-w-6xl flex-1 px-4 ${wide ? "" : "py-6"}`}>{children}</main>
      <footer className="mt-6 border-t border-line bg-panel">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 px-4 py-4 text-sm text-ink-2 sm:flex-row">
          <span><b className="text-ink">© 2026 LostFinder</b> · Distributed Lost &amp; Found Property Management System</span>
          <span className="flex gap-4">
            <Link href="/lost" className="hover:text-ink">Lost items</Link>
            <Link href="/found" className="hover:text-ink">Found items</Link>
            <Link href="/status" className="hover:text-ink">Network status</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
