"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useApp } from "@/lib/app-context";
import { branchName } from "@/lib/branches";
import BranchDownBanner from "../BranchDownBanner";
import PublicLayout from "./PublicLayout";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const COLLAPSE_KEY = "lostfinder.sidebar";

/**
 * Layout for every page: a fixed sidebar on the left (collapsible on desktop, a drawer on phones),
 * a top bar, the page, and a footer. The public home page shows its own layout to visitors.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, ready, branch } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* keep expanded */
    }
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggle() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((c) => {
        try {
          localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
        } catch {
          /* fine */
        }
        return !c;
      });
    } else {
      setMobileOpen((o) => !o);
    }
  }

  // Visitors get the public layout (top bar, no sidebar); signed-in users get the dashboard layout
  if (!ready) return <div className="min-h-screen bg-app" />;
  if (!user) return <PublicLayout>{children}</PublicLayout>;

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      </Suspense>
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${collapsed ? "lg:pl-[72px]" : "lg:pl-[250px]"}`}>
        <Topbar onMenu={toggle} />
        <BranchDownBanner />
        <main className="flex-1 px-3 py-5 sm:px-5 lg:px-6">{children}</main>
        <footer className="flex flex-col gap-1 border-t border-line bg-panel px-5 py-3.5 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
          <span><b className="text-ink">© 2026 LostFinder</b> · Distributed Lost &amp; Found</span>
          <span>Connected to {branchName(branch.id)} branch</span>
        </footer>
      </div>
    </div>
  );
}
