"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, NotepadText } from "lucide-react";
import { LeaveInquiryView } from "@/features/leave/components/leave-inquiry-view";

export default function LeaveHistoryPage() {
  const router = useRouter();

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex-shrink-0 bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <NotepadText className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">연차 조회</h1>
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <LeaveInquiryView />
      </div>
    </div>
  );
}
