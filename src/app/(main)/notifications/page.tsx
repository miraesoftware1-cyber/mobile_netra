"use client";

import { useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Bell, BellOff } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useNotificationStore } from "@/features/notifications/use-notification-store";

function timeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ko });
  } catch {
    return dateStr;
  }
}

export default function NotificationsPage() {
  const companyCode  = useAuthStore((s) => s.user?.companyCode ?? "");
  const empCode      = useAuthStore((s) => s.user?.emp_code ?? "");
  const { items, loading, markAllRead } = useNotificationStore();

  useEffect(() => {
    if (!companyCode || !empCode) return;
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyCode, empCode, ids: "all" }),
    }).catch(() => {});
    markAllRead();
  }, [companyCode, empCode, markAllRead]);

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 border-b border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">알림</h1>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">
            불러오는 중...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <BellOff className="w-10 h-10 text-gray-200" />
            <p className="text-sm text-gray-400">알림이 없습니다</p>
          </div>
        )}

        {items.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {items.map((n) => {
              const isUnread = !n.read_at;
              return (
                <li
                  key={n.id}
                  className={`px-5 py-4 flex gap-3 ${isUnread ? "bg-primary/[0.03]" : "bg-white"}`}
                >
                  <div className="shrink-0 mt-0.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isUnread ? "bg-primary/10" : "bg-gray-100"}`}>
                      <Bell className={`w-4 h-4 ${isUnread ? "text-primary" : "text-gray-400"}`} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium leading-snug ${isUnread ? "text-gray-900" : "text-gray-600"}`}>
                        {n.title}
                      </p>
                      {isUnread && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.sent_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
