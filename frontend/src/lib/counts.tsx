"use client";

/**
 * Small numbers shown as badges in the sidebar and on the dashboards: the user's own figures
 * (GET /me/overview) and, for staff, how many claims wait for them. Refreshed when a live
 * notification arrives, when the branch changes, and every 30 seconds.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApp } from "./app-context";
import { useNotifications } from "./notifications";
import type { Claim, MyOverview } from "./types";

interface CountsState {
  me: MyOverview | null;
  staffPending: number;
  staffCollect: number;
  staffClaims: Claim[] | null;
  refresh: () => void;
}
const Ctx = createContext<CountsState | null>(null);

export function CountsProvider({ children }: { children: ReactNode }) {
  const { user, api } = useApp();
  const { liveVersion } = useNotifications();
  const [me, setMe] = useState<MyOverview | null>(null);
  const [staffClaims, setStaffClaims] = useState<Claim[] | null>(null);
  const isStaff = user?.role === "staff" || user?.role === "admin";

  const refresh = useCallback(() => {
    if (!user) {
      setMe(null);
      setStaffClaims(null);
      return;
    }
    api<MyOverview>("/me/overview").then(setMe).catch(() => {});
    if (isStaff) api<Claim[]>("/claims").then(setStaffClaims).catch(() => {});
  }, [api, user, isStaff]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh, liveVersion]);

  const value = useMemo(() => ({
    me,
    staffClaims,
    staffPending: staffClaims?.filter((c) => c.status === "PENDING").length ?? 0,
    staffCollect: staffClaims?.filter((c) => c.status === "APPROVED" && !c.handed_over_at).length ?? 0,
    refresh,
  }), [me, staffClaims, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCounts(): CountsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCounts must be used inside <CountsProvider>");
  return ctx;
}
