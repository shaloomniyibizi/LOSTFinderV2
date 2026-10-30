import { PackageSearch } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthCard({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-indigo-100/70 to-transparent" />
      <div className="relative mx-auto max-w-md px-4 py-14">
        <div className="mb-6 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg">
            <PackageSearch className="h-6 w-6" />
          </span>
        </div>
        <div className="card p-8">
          <h1 className="text-center text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-center text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
