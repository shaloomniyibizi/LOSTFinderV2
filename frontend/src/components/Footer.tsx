import { PackageSearch } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-4 w-4 text-indigo-600" />
          <span>
            <b className="text-slate-700">LostFinder</b>: Distributed Lost and Found Property Management System
          </span>
        </div>
        <div className="flex gap-5">
          <Link href="/search" className="hover:text-slate-800">Browse</Link>
          <Link href="/report" className="hover:text-slate-800">Report</Link>
          <Link href="/status" className="hover:text-slate-800">Network status</Link>
        </div>
      </div>
    </footer>
  );
}
