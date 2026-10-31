"use client";

import { useEffect, useState } from "react";
import { useApp } from "./app-context";
import { useNotifications } from "./notifications";
import type { Overview } from "./types";

/** Network-wide figures from GET /stats/overview, refreshed every 30 s and on live updates. */
export function useOverview(): { data: Overview | null; error: string | null; updatedAt: Date | null } {
  const { api, branch } = useApp();
  const { liveVersion } = useNotifications();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Overview>("/stats/overview")
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(null);
          setUpdatedAt(new Date());
        })
        .catch((e) => alive && setError((e as Error).message));
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [api, branch.id, liveVersion]);

  return { data, error, updatedAt };
}
