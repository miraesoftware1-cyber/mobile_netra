"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useNotificationStore } from "./use-notification-store";

const POLL_INTERVAL_MS = 60_000;

export function useNotifications() {
  const companyCode = useAuthStore((s) => s.user?.companyCode ?? "");
  const empCode     = useAuthStore((s) => s.user?.emp_code ?? "");
  const { setItems, setLoading } = useNotificationStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!companyCode || !empCode) return;
    try {
      const params = new URLSearchParams({ companyCode, empCode });
      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) return;
      const data: { items: import("@/app/api/notifications/route").NotificationRow[]; unreadCount: number } =
        await res.json();
      setItems(data.items ?? [], data.unreadCount ?? 0);
    } catch { /* 무시 */ }
  }, [companyCode, empCode, setItems]);

  useEffect(() => {
    if (!companyCode || !empCode) return;

    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));

    timerRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") fetchNotifications();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [companyCode, empCode, fetchNotifications, setLoading]);

  return { fetchNotifications };
}
