"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, TicketsPlane } from "lucide-react";
import { LeaveRequestForm } from "@/features/leave/components/leave-request-form";

export default function LeaveRequestPage() {
  const router = useRouter();

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-white">
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-gray-100 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <TicketsPlane className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">연차 신청</h1>
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <LeaveRequestForm />
      </div>
    </div>
  );
}
