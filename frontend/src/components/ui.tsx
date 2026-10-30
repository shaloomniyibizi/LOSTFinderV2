import { AlertCircle, CheckCircle2, Info, Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: { cls: "border-rose-200 bg-rose-50 text-rose-800", Icon: AlertCircle },
    success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", Icon: CheckCircle2 },
    info: { cls: "border-sky-200 bg-sky-50 text-sky-800", Icon: Info },
  }[kind];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${styles.cls}`} role={kind === "error" ? "alert" : "status"}>
      <styles.Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
