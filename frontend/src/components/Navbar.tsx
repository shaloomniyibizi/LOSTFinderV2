"use client";

import { LogOut, Menu, PackageSearch, Plus, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/app-context";
import BranchSwitcher from "./BranchSwitcher";
import NotificationBell from "./NotificationBell";

const LINKS = [
  { href: "/search", label: "Browse items" },
  { href: "/my-items", label: "My reports", auth: true },
  { href: "/staff", label: "Staff desk", staff: true },
  { href: "/status", label: "Network status" },
];

export default function Navbar() {
  const { user, logout } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isStaff = user?.role === "staff" || user?.role === "admin";
  const links = LINKS.filter((l) => (!l.auth || user) && (!l.staff || isStaff));
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  function signOut() {
    logout();
    setOpen(false);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
            <PackageSearch className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight">LostFinder</span>
            <span className="block text-[11px] font-medium text-slate-500">Lost &amp; found network</span>
          </span>
        </Link>

        <div className="ml-6 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(l.href) ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <BranchSwitcher />
          <Link href="/report" className="btn-primary">
            <Plus className="h-4 w-4" /> Report item
          </Link>
          {user ? (
            <div className="flex items-center gap-1 pl-1">
              <NotificationBell />
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700" title={user.email}>
                {user.full_name.charAt(0).toUpperCase()}
              </span>
              <button onClick={signOut} className="btn-ghost px-2.5" title="Log out" aria-label="Log out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn-secondary">
              <UserRound className="h-4 w-4" /> Log in
            </Link>
          )}
        </div>

        {user && <div className="ml-auto md:hidden"><NotificationBell /></div>}
        <button className={`btn-ghost px-2.5 md:hidden ${user ? "" : "ml-auto"}`} onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <BranchSwitcher full />
            <Link href="/report" onClick={() => setOpen(false)} className="btn-primary">
              <Plus className="h-4 w-4" /> Report item
            </Link>
            {user ? (
              <button onClick={signOut} className="btn-secondary">
                <LogOut className="h-4 w-4" /> Log out {user.full_name.split(" ")[0]}
              </button>
            ) : (
              <Link href="/login" onClick={() => setOpen(false)} className="btn-secondary">
                Log in
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
