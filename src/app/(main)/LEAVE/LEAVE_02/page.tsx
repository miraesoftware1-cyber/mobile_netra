"use client";

import { ChevronLeft, CalendarCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMenuStore } from "@/features/menu/use-menu-store";
import { LeaveApprovalList } from "@/features/leave/components/leave-approval-list";

export default function LeaveApprovalPage() {
  const router = useRouter();
  const items = useMenuStore((s) => s.items);
  const perms = useMenuStore((s) => s.perms);

  // 이 메뉴의 menu_id 찾기 (menu_exec 기준)
  const menuId = items.find((m) =>
    m.menu_exec?.replace(/^\//, "").toLowerCase() === "leave/leave_02",
  )?.menu_id;

  const canApprove = menuId ? (perms[menuId]?.approve ?? false) : false;

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex-shrink-0 bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">연차 승인</h1>
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col min-h-0">
        <LeaveApprovalList canApprove={canApprove} />
      </div>
    </div>
  );
}
