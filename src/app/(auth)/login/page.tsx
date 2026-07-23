"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/menu");
    }
  }, [isLoggedIn, router]);

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 rounded-2xl mb-4 shadow-md bg-gray-900 flex items-center justify-center">
              <span className="text-3xl font-bold text-white">N</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Netra
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              회사 코드와 전화번호로 로그인하세요
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <LoginForm />
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-gray-400">
        © Miraesoftware. All rights reserved.
      </footer>
    </div>
  );
}
