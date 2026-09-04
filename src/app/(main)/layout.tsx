"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useMenuStore } from "@/features/menu/use-menu-store";
import { BottomTabNav } from "@/features/main/components/bottom-tab-nav";
import { UpdateBanner } from "@/components/update-banner";
import type { MenuDBItem } from "@/app/api/menu-visibility/route";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user        = useAuthStore((s) => s.user);
  const companyCode = useAuthStore((s) => s.user?.companyCode ?? "");
  const userId      = useAuthStore((s) => s.user?.user_id ?? "");
  const userType    = useAuthStore((s) => s.user?.user_type ?? "");
  const setItems    = useMenuStore((s) => s.setItems);
  const setPerms    = useMenuStore((s) => s.setPerms);

  // persist 스토어가 localStorage에서 복원될 때까지 대기
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
      return unsub;
    }
  }, []);

  // 하이드레이션 완료 후에만 로그인 체크 (새로고침 시 튕김 방지)
  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
    }
  }, [user, router, hydrated]);

  // 어느 페이지에서 새로고침해도, 그리고 앱을 다시 열어도 권한이 항상 최신 상태 유지
  useEffect(() => {
    if (!companyCode || !userId) return;

    async function loadPerms() {
      try {
        const params = new URLSearchParams({ companyCode, userId, userType });
        const r = await fetch(`/api/menu-visibility?${params.toString()}`);
        const data: { items: MenuDBItem[] | null; perms?: Record<string, { view: boolean; add: boolean; edit: boolean; del: boolean; approve: boolean }> } = await r.json();
        if (Array.isArray(data.items)) setItems(data.items);
        if (data.perms) setPerms(data.perms);
      } catch { /* 무시 */ }
    }

    loadPerms();

    // 앱을 백그라운드에서 포그라운드로 전환할 때 권한 재조회
    function onVisible() {
      if (document.visibilityState === "visible") loadPerms();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [companyCode, userId, userType, setItems, setPerms]);

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <main className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
      <BottomTabNav />
      <UpdateBanner />
    </div>
  );
}
