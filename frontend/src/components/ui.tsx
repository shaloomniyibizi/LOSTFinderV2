"use client";

import { AlertCircle, ArrowRight, CheckCircle2, ChevronRight, Info, Loader2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/lib/app-context";
import type { ReactNode } from "react";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: { cls: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200", Icon: AlertCircle },
    success: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200", Icon: CheckCircle2 },
    info: { cls: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200", Icon: Info },
  }[kind];
  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-4 py-3 text-sm ${styles.cls}`} role={kind === "error" ? "alert" : "status"}>
      <styles.Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, bare = false }: { icon: LucideIcon; title?: string; children?: ReactNode; bare?: boolean }) {
  return (
    <div className={`${bare ? "" : "card"} flex flex-col items-center px-6 py-12 text-center`}>
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/15 text-brand">
        <Icon className="h-7 w-7" />
      </span>
      {title && <h3 className="mt-4 font-semibold text-ink">{title}</h3>}
      {children && <div className="mt-1.5 max-w-sm text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/** Kept for older pages: a simple title + subtitle. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-ink-2">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Page title on the left, breadcrumb on the right (like the reference design). */
export function PageTitle({ title, crumbs = [] }: { title?: string; crumbs?: { label: string; href?: string }[] }) {
  const { user } = useApp();
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      {title ? <h1 className="text-2xl font-medium tracking-tight sm:text-[1.75rem]">{title}</h1> : <span />}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[0.95rem]">
        <Link href={user ? "/dashboard" : "/"} className="text-brand hover:underline">{user ? "Dashboard" : "Home"}</Link>
        {crumbs.map((c) => (
          <span key={c.label} className="flex items-center gap-1.5">
            <span className="text-ink-3">/</span>
            {c.href ? <Link href={c.href} className="text-brand hover:underline">{c.label}</Link> : <span className="text-ink-2">{c.label}</span>}
          </span>
        ))}
      </nav>
    </div>
  );
}

const HERO = {
  blue: "from-[#162a5b] via-[#1d3f8f] to-[#2f6ae0]",
  orange: "from-[#9a3c0a] via-[#b4530f] to-[#d97706]",
  green: "from-[#0b4d3a] via-[#0f6b4f] to-[#159a6c]",
  violet: "from-[#3b1f8f] via-[#5b2bc2] to-[#7c4ae6]",
  teal: "from-[#0b3d56] via-[#0e5f7c] to-[#1590a8]",
};
export type HeroTone = keyof typeof HERO;

/** Coloured banner at the top of a page, with an optional panel attached below it (filters, stats). */
export function Hero({
  tone = "blue", icon: Icon, title, subtitle, actions, badges, children, flat = false,
}: {
  tone?: HeroTone; icon?: LucideIcon; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; badges?: ReactNode; children?: ReactNode;
  /** true = no card around it (when it sits inside another card) */
  flat?: boolean;
}) {
  return (
    <section className={flat ? "overflow-hidden" : "card mb-6 overflow-hidden"}>
      <div className={`relative overflow-hidden bg-gradient-to-r ${HERO[tone]} px-5 py-6 text-white sm:px-6`}>
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-28 right-40 h-56 w-56 rounded-full bg-white/[0.04]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            {Icon && (
              <span className="hidden h-13 w-13 shrink-0 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/20 sm:flex">
                <Icon className="h-6 w-6" />
              </span>
            )}
            <div>
              {badges && <div className="mb-2 flex flex-wrap gap-2">{badges}</div>}
              <h2 className="text-2xl font-bold tracking-tight sm:text-[1.65rem]">{title}</h2>
              {subtitle && <p className="mt-1 text-white/85">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}

const TINT = {
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  slate: "bg-panel-2 text-ink-2",
};
export type Tint = keyof typeof TINT;

export function IconTile({ icon: Icon, tint, size = "md" }: { icon: LucideIcon; tint: Tint; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-9 rounded-md" : "h-12 w-12 rounded-lg";
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${TINT[tint]}`}>
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

/** A number with an icon, a short note and a "View details" link (the dashboard's top row). */
export function StatCard({ icon, tint, label, value, note, href }: { icon: LucideIcon; tint: Tint; label: string; value: ReactNode; note?: string; href?: string }) {
  return (
    <div className="card flex flex-col">
      <div className="flex flex-1 gap-4 p-4">
        <IconTile icon={icon} tint={tint} />
        <div className="min-w-0">
          <p className="text-sm text-ink-2">{label}</p>
          <p className="mt-0.5 text-[1.75rem] font-bold leading-tight tabular-nums">{value}</p>
          {note && <p className="mt-0.5 text-sm text-ink-3">{note}</p>}
        </div>
      </div>
      {href && (
        <Link href={href} className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm hover:bg-panel-2">
          View details <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/** Underlined tabs for a card header. */
export function CardTabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; icon?: LucideIcon; count?: number; countCls?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button key={t.value} role="tab" aria-selected={on} onClick={() => onChange(t.value)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-x border-t px-4 py-3 text-[0.95rem] transition first:border-l-0
              ${on ? "rounded-t-md border-line bg-panel text-ink" : "border-transparent text-brand hover:text-ink"}`}>
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${t.countCls ?? "bg-amber-400 text-slate-900"}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Pill filters ("All 7 · Open 2 · …"). */
export function PillTabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button key={t.value} onClick={() => onChange(t.value)} aria-pressed={on}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${on ? "bg-brand-strong text-white" : "text-brand hover:bg-panel-2"}`}>
            {t.label}
            {t.count !== undefined && (
              <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${on ? "bg-white text-slate-900" : "bg-ink-3/40 text-ink"}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A vertical timeline entry (notifications, claim decisions). */
export function TimelineItem({ icon: Icon, iconCls, time, title, href, children, last = false }: {
  icon: LucideIcon; iconCls: string; time: string; title: string; href?: string; children?: ReactNode; last?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-4">
      {!last && <span className="absolute left-[15px] top-8 bottom-0 w-[3px] rounded bg-line" aria-hidden />}
      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconCls}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-line bg-panel shadow-sm">
        <div className="border-b border-line px-3 py-2">
          <p className="text-xs text-ink-3">{time}</p>
          {href ? <Link href={href} className="font-semibold text-brand hover:underline">{title}</Link> : <p className="font-semibold">{title}</p>}
        </div>
        {children && <div className="px-3 py-2 text-sm text-ink-2">{children}</div>}
      </div>
    </li>
  );
}

export function ViewAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
      {children} <ChevronRight className="h-4 w-4" />
    </Link>
  );
}
