"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ko } from "date-fns/locale";
import { Bell, BellOff, X } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useNotificationStore } from "@/features/notifications/use-notification-store";
import type { NotificationRow } from "@/app/api/notifications/route";

function timeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ko });
  } catch {
    return dateStr;
  }
}

function fmtFull(dateStr: string) {
  try {
    return format(new Date(dateStr), "yyyy.MM.dd HH:mm", { locale: ko });
  } catch {
    return dateStr;
  }
}

export default function NotificationsPage() {
  const companyCode  = useAuthStore((s) => s.user?.companyCode ?? "");
  const empCode      = useAuthStore((s) => s.user?.emp_code ?? "");
  const { items, loading, setItems, markOneRead } = useNotificationStore();
  const [detail, setDetail] = useState<NotificationRow | null>(null);
  const searchParams = useSearchParams();
  const deepLinkId   = searchParams.get("id") ? Number(searchParams.get("id")) : null;

  // 탭 진입 시 최신 데이터 로드 (읽음 처리는 클릭 시에만)
  useEffect(() => {
    if (!companyCode || !empCode) return;
    const params = new URLSearchParams({ companyCode, empCode });
    fetch(`/api/notifications?${params}`)
      .then((r) => r.json())
      .then((data: { items: NotificationRow[]; unreadCount: number }) => {
        setItems(data.items ?? [], data.unreadCount ?? 0);
      })
      .catch(() => {});
  }, [companyCode, empCode, setItems]);

  // 푸쉬 알림 클릭으로 진입 시 해당 알림 자동 팝업
  useEffect(() => {
    if (!deepLinkId || items.length === 0) return;
    const target = items.find((n) => n.id === deepLinkId);
    if (target) handleClick(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, items]);

  function handleClick(n: NotificationRow) {
    // 미확인이면 읽음 처리
    if (!n.read_at) {
      markOneRead(n.id);
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode, empCode, ids: [n.id] }),
      }).catch(() => {});
    }
    setDetail(n);
  }

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
                  onClick={() => handleClick(n)}
                  className={`px-5 py-4 flex gap-3 cursor-pointer active:bg-gray-50 ${isUnread ? "bg-primary/[0.03]" : "bg-white"}`}
                >
                  <div className="shrink-0 mt-0.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isUnread ? "bg-primary/10" : "bg-gray-100"}`}>
                      <Bell className={`w-4 h-4 ${isUnread ? "text-primary" : "text-gray-400"}`} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-gray-900" : "font-normal text-gray-500"}`}>
                        {n.title}
                      </p>
                      {isUnread && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-1">{n.body}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.sent_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 상세 팝업 */}
      {detail && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setDetail(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6 pointer-events-none">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl pointer-events-auto">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-gray-900">{detail.title}</span>
                </div>
                <button onClick={() => setDetail(null)} className="p-1 text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                {detail.body && (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{detail.body}</p>
                )}
                <p className="text-xs text-gray-400">{fmtFull(detail.sent_at)}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
