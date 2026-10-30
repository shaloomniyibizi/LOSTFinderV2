"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { BRANCHES } from "./branches";
import type { Health } from "./types";

export type HealthMap = Record<string, { online: boolean; ms: number | null; health: Health | null }>;

/*
 * One shared heartbeat checker for the whole page: every few seconds it calls each branch's
 * /health endpoint. Components that use useBranchHealth() all read the same result.
 */
const INTERVAL_MS = 6000;
let latest: HealthMap | null = null;
const listeners = new Set<(m: HealthMap) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function checkAll() {
  const entries = await Promise.all(
    BRANCHES.map(async (b) => {
      const start = performance.now();
      try {
        const health = await apiFetch<Health>(b.url, "/health", { timeoutMs: 3000 });
        return [b.id, { online: true, ms: Math.round(performance.now() - start), health }] as const;
      } catch {
        return [b.id, { online: false, ms: null, health: null }] as const;
      }
    }),
  );
  latest = Object.fromEntries(entries);
  listeners.forEach((fn) => fn(latest!));
}

export function useBranchHealth(): HealthMap | null {
  const [map, setMap] = useState<HealthMap | null>(latest);

  useEffect(() => {
    listeners.add(setMap);
    if (!timer) {
      checkAll();
      timer = setInterval(checkAll, INTERVAL_MS);
    } else if (latest) {
      setMap(latest);
    }
    return () => {
      listeners.delete(setMap);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return map;
}
