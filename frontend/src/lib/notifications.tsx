"use client";

/**
 * Live notifications.
 *  - Opens ONE WebSocket to the branch you are using (ws://<branch>/ws?token=...).
 *  - When a message arrives (new match, claim decision…), shows a toast and refreshes the activity list.
 *  - If the connection drops (branch restarted, network), it reconnects automatically.
 *  - The activity list (the bell) comes from GET /me/activity, which is the same on every branch.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "./app-context";
import type { Activity, LiveMessage } from "./types";

export interface Toast {
  id: number;
  title: string;
  message: string;
  link?: string;
  kind: "match" | "claim" | "info";
}

interface NotificationsState {
  connected: boolean;
  activity: Activity[];
  unread: number;
  markAllRead: () => void;
  refresh: () => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  pushToast: (t: Omit<Toast, "id">) => void;
  /** Increases whenever a live message arrives, so pages can reload their data. */
  liveVersion: number;
}

const Ctx = createContext<NotificationsState | null>(null);

function seenKey(userId: string) {
  return `lostfinder.seen.${userId}`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, token, branch, api } = useApp();
  const [connected, setConnected] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [lastSeen, setLastSeen] = useState<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [liveVersion, setLiveVersion] = useState(0);
  const toastId = useRef(0);

  const refresh = useCallback(() => {
    if (!user) return;
    api<Activity[]>("/me/activity").then(setActivity).catch(() => {});
  }, [api, user]);

  useEffect(() => {
    if (!user) {
      setActivity([]);
      return;
    }
    try {
      setLastSeen(window.localStorage.getItem(seenKey(user.id)) ?? "");
    } catch {
      setLastSeen("");
    }
    refresh();
  }, [user, refresh, branch.id]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 8000);
  }, []);

  // The WebSocket, reconnecting with a growing delay if it closes
  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const connect = () => {
      const url = branch.url.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;
      try {
        ws = new WebSocket(url);
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25000);
      };
      ws.onmessage = (ev) => {
        let msg: LiveMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "hello") return;
        pushToast({ kind: msg.type, title: msg.title ?? "Update", message: msg.message ?? "", link: msg.link });
        setLiveVersion((v) => v + 1);
        refresh();
      };
      ws.onclose = () => {
        setConnected(false);
        if (ping) clearInterval(ping);
        schedule();
      };
      ws.onerror = () => ws?.close();
    };
    const schedule = () => {
      if (stopped) return;
      attempt += 1;
      retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(attempt, 4)));
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      ws?.close();
      setConnected(false);
    };
  }, [token, branch.url, pushToast, refresh]);

  const unread = useMemo(() => activity.filter((a) => !lastSeen || a.at > lastSeen).length, [activity, lastSeen]);

  const markAllRead = useCallback(() => {
    if (!user || !activity.length) return;
    const newest = activity[0].at;
    setLastSeen(newest);
    try {
      window.localStorage.setItem(seenKey(user.id), newest);
    } catch {
      /* storage blocked: unread count resets on reload, that's fine */
    }
  }, [user, activity]);

  const value = useMemo(
    () => ({ connected, activity, unread, markAllRead, refresh, toasts, dismiss, pushToast, liveVersion }),
    [connected, activity, unread, markAllRead, refresh, toasts, dismiss, pushToast, liveVersion],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return ctx;
}
