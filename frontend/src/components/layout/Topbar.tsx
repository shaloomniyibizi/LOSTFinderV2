"use client";

import { Check, ChevronDown, FileText, LogOut, Maximize, Menu, Minimize, Monitor, Moon, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/lib/app-context";
import { useAuthModal } from "@/lib/auth-modal";
import { branchName } from "@/lib/branches";
import { type ThemeChoice, useTheme } from "@/lib/theme";
import BranchSwitcher from "../BranchSwitcher";
import NotificationBell from "../NotificationBell";

const TITLES: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/lost", "Lost items"],
  ["/found", "Found items"],
  ["/search", "Search"],
  ["/report", "New report"],
  ["/matches", "My matches"],
  ["/claims", "My claims"],
  ["/my-items", "My reports"],
  ["/notifications", "Notifications"],
  ["/staff", "Security desk"],
  ["/status", "Network status"],
  ["/profile", "My profile"],
  ["/items", "Item details"],
];

/** Closes a dropdown when you click outside it or press Escape. */
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function Menu_({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`absolute right-0 z-50 mt-2 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-xl ${className}`}>{children}</div>;
}

export function ThemeMenu() {
  const { choice, dark, setChoice } = useTheme();
  const { open, setOpen, ref } = useDropdown();
  const options: [ThemeChoice, string, typeof Sun][] = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "Auto", Monitor]];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="btn-ghost gap-0.5 px-2" aria-label="Theme" aria-expanded={open}>
        {dark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <Menu_ className="w-36">
          {options.map(([v, label, Icon]) => (
            <button key={v} onClick={() => { setChoice(v); setOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-panel-2">
              <Icon className="h-4 w-4 text-ink-2" /> <span className="flex-1 text-left">{label}</span>
              {choice === v && <Check className="h-4 w-4 text-brand" />}
            </button>
          ))}
        </Menu_>
      )}
    </div>
  );
}

function FullscreenButton() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  return (
    <button onClick={toggle} className="btn-ghost hidden px-2 sm:inline-flex" aria-label={full ? "Exit full screen" : "Full screen"}>
      {full ? <Minimize className="h-[18px] w-[18px]" /> : <Maximize className="h-[18px] w-[18px]" />}
    </button>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 font-semibold text-white ring-2 ring-panel"
      style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials || "?"}
    </span>
  );
}

function UserMenu() {
  const { user, logout } = useApp();
  const router = useRouter();
  const { open, setOpen, ref } = useDropdown();
  if (!user) return null;
  const roleLabel = user.role === "admin" ? "Administrator" : user.role === "staff" ? `Staff · ${branchName(user.branch_id)}` : "Member";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-panel-2" aria-expanded={open}>
        <Avatar name={user.full_name} />
        <span className="hidden max-w-36 truncate text-sm md:block">{user.full_name.split(" ")[0]}</span>
      </button>
      {open && (
        <Menu_ className="w-64">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Avatar name={user.full_name} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.full_name}</p>
              <p className="truncate text-xs text-ink-2">{user.email}</p>
              <p className="mt-0.5 text-xs text-brand">{roleLabel}</p>
            </div>
          </div>
          <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-panel-2"><UserRound className="h-4 w-4 text-ink-2" /> My profile</Link>
          <Link href="/my-items" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-panel-2"><FileText className="h-4 w-4 text-ink-2" /> My reports</Link>
          <button onClick={() => { logout(); setOpen(false); router.push("/"); }} className="flex w-full items-center gap-2 border-t border-line px-4 py-2 text-sm text-rose-600 hover:bg-panel-2 dark:text-rose-400">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </Menu_>
      )}
    </div>
  );
}

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useApp();
  const { openAuth } = useAuthModal();
  const pathname = usePathname();
  const title = TITLES.find(([p]) => pathname === p || pathname.startsWith(p + "/"))?.[1] ?? "";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-panel px-3 sm:px-4">
      <button onClick={onMenu} className="btn-ghost px-2" aria-label="Toggle menu">
        <Menu className="h-5 w-5" />
      </button>
      <span className="hidden truncate text-[0.95rem] text-ink-2 sm:block">{title}</span>
      <div className="ml-auto flex items-center gap-1">
        <BranchSwitcher />
        {user && <NotificationBell />}
        <ThemeMenu />
        <FullscreenButton />
        {user ? (
          <UserMenu />
        ) : (
          <>
            <button onClick={() => openAuth("login")} className="btn-ghost text-brand">Sign in</button>
            <button onClick={() => openAuth("register")} className="btn-primary hidden sm:inline-flex">Register</button>
          </>
        )}
      </div>
    </header>
  );
}
