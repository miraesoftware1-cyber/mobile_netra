"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { BottomTabNav } from "@/features/main/components/bottom-tab-nav";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
    }
  }, [isLoggedIn, router]);

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <main className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
      <BottomTabNav />
    </div>
  );
}
