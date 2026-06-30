"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Wallet } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { ExpenseResolutionForm } from "@/features/expense/components/expense-resolution-form";

export default function ExpenseRequestPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isLoggedIn()) {
      router.replace("/login");
    }
  }, [mounted, isLoggedIn, router]);

  if (!mounted) return null;

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-white">
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-gray-100 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 active:bg-gray-200"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">지출결의 등록</h1>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ExpenseResolutionForm />
      </div>
    </div>
  );
}
