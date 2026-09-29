"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const SESSION_KEY = "netra-push-registered";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

export function usePushSubscription() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // 세션당 한 번만 실행 (페이지 이동마다 재구독 방지)
    const flagKey = `${SESSION_KEY}-${user.emp_code}`;
    if (sessionStorage.getItem(flagKey)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        if (Notification.permission !== "granted") return;

        // 세션 플래그 있어도 실제 구독이 없으면 재구독
        const existing = await reg.pushManager.getSubscription();
        if (sessionStorage.getItem(flagKey) && existing) return;

        if (existing) await existing.unsubscribe();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            emp_code: user.emp_code,
            user_id: user.user_id,
            corp_code: user.corp_code,
            manage_dpt_codes: user.manage_dpt_codes,
          }),
        });

        sessionStorage.setItem(flagKey, "1");
      } catch (err) {
        console.error("[push] 구독 등록 실패:", err);
      }
    })();
  }, [user]);
}
