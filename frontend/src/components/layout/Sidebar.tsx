"use client";

import {
  Activity, Bell, CirclePlus, ClipboardCheck, FileText, LayoutDashboard, Link2, Package,
  PackageCheck, Search, ShieldCheck, SquarePlus, UserRound, UsersRound, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { BRANCHES } from "@/lib/branches";
import { useCounts } from "@/lib/counts";
import { useNotifications } from "@/lib/notifications";
import { useBranchHealth } from "@/lib/use-branch-health";
import Logo from "./Logo";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: { value: number; cls: string };
}
interface Section {
  title?: string;
  items: NavItem[];
}

export default function Sidebar({ collapsed, mobileOpen, onClose }: { collapsed: boolean; mobileOpen: boolean; onClose: () => void }) {
  const { user, branch } = useApp();
  const { me, staffPending, staffCollect } = useCounts();
  const { unread } = useNotifications();
  const pathname = usePathname();
  const params = useSearchParams();
  const health = useBranchHealth();
  const isStaff = user?.role === "staff" || user?.role === "admin";

  const sections: Section[] = [
    ...(user ? [{ items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] }] : []),
    {
      title: "Reports",
      items: [
        { href: "/lost", label: "Lost items", icon: Search },
        { href: "/found", label: "Found items", icon: Package },
        { href: "/report?type=LOST", label: "Report lost item", icon: CirclePlus },
        { href: "/report?type=FOUND", label: "Turn in found item", icon: SquarePlus },
      ],
    },
    ...(user
      ? [{
          title: "Recovery",
          items: [
            { href: "/matches", label: "My matches", icon: Link2, badge: { value: me?.matches ?? 0, cls: "bg-amber-400 text-slate-900" } },
            { href: "/claims", label: "My claims", icon: ClipboardCheck, badge: { value: me?.ready_to_collect ?? 0, cls: "bg-emerald-500 text-white" } },
            { href: "/my-items", label: "My reports", icon: FileText },
            { href: "/notifications", label: "Notifications", icon: Bell, badge: { value: unread, cls: "bg-cyan-400 text-slate-900" } },
          ],
        }]
      : []),
    ...(isStaff
      ? [{
          title: "Security desk",
          items: [
            { href: "/staff?tab=pending", label: "Review queue", icon: ShieldCheck, badge: { value: staffPending, cls: "bg-rose-500 text-white" } },
            { href: "/staff?tab=collect", label: "Awaiting handover", icon: PackageCheck, badge: { value: staffCollect, cls: "bg-blue-500 text-white" } },
          ],
        }]
      : []),
    ...(user?.role === "admin"
      ? [{ title: "Administration", items: [{ href: "/admin/users", label: "User management", icon: UsersRound }] }]
      : []),
    { title: "Network", items: [{ href: "/status", label: "Network status", icon: Activity }] },
    {
      title: "Account",
      items: [{ href: "/profile", label: "My profile", icon: UserRound }],
    },
  ];

  function isActive(href: string) {
    const [path, query] = href.split("?");
    if (pathname !== path && !(path !== "/" && pathname.startsWith(path + "/"))) return false;
    if (!query) return true;
    const [k, v] = query.split("=");
    return (params.get(k) ?? (k === "tab" ? "pending" : k === "type" ? "LOST" : "")) === v;
  }

  const narrow = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-ink shadow-xl transition-all duration-200
          ${mobileOpen ? "w-[250px] translate-x-0" : "-translate-x-full lg:translate-x-0"} ${narrow ? "lg:w-[72px]" : "lg:w-[250px]"}`}
        aria-label="Main menu"
      >
        <div className="flex h-14 shrink-0 items-center justify-center gap-2 border-b border-white/10 px-4">
          <Link href={user ? "/dashboard" : "/"} onClick={onClose} className="flex items-center gap-2">
            <Logo />
            {!narrow && <span className="text-lg font-semibold tracking-tight text-white">LostFinder</span>}
          </Link>
          {mobileOpen && (
            <button onClick={onClose} className="ml-auto rounded p-1 text-sidebar-ink hover:bg-white/10 lg:hidden" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4 pt-2 [scrollbar-width:thin]">
          {sections.map((s, i) => (
            <div key={s.title ?? i}>
              {s.title && (narrow ? <div className="mx-3 my-3 border-t border-white/10" /> : <p className="section-label">{s.title}</p>)}
              <ul className="space-y-0.5">
                {s.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        title={narrow ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] transition
                          ${active ? "bg-white/10 text-white shadow-sm" : "hover:bg-white/5 hover:text-white"} ${narrow ? "justify-center" : ""}`}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {!narrow && <span className="flex-1 truncate">{item.label}</span>}
                        {item.badge && item.badge.value > 0 && (
                          <span className={`rounded px-1.5 py-px text-xs font-bold ${item.badge.cls} ${narrow ? "absolute right-1 top-0.5 text-[10px]" : ""}`}>
                            {item.badge.value > 99 ? "99+" : item.badge.value}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* The three branches at a glance: this is a distributed system */}
        <Link href="/status" onClick={onClose} className="shrink-0 border-t border-white/10 px-4 py-3 hover:bg-white/5" title="Network status">
          {!narrow && <p className="mb-2 text-xs uppercase tracking-wide text-sidebar-ink/70">Branch network</p>}
          <div className={`flex ${narrow ? "flex-col items-center gap-2" : "gap-3"}`}>
            {BRANCHES.map((b) => {
              const h = health?.[b.id];
              const dot = !h ? "bg-slate-500" : h.online ? "bg-emerald-400" : "bg-rose-500";
              return (
                <span key={b.id} className={`flex items-center gap-1.5 text-xs ${b.id === branch.id ? "font-semibold text-white" : ""}`}>
                  <span className={`h-2 w-2 rounded-full ${dot} ${h?.online ? "shadow-[0_0_0_3px_rgba(52,211,153,0.15)]" : ""}`} />
                  {narrow ? b.id : b.name}
                </span>
              );
            })}
          </div>
        </Link>
      </aside>
    </>
  );
}
