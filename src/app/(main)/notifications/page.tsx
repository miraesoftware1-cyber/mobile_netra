"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { ko } from "date-fns/locale";
import { Bell, BellOff, X, Loader2, Building2 } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useNotificationStore } from "@/features/notifications/use-notification-store";
import type { NotificationRow } from "@/app/api/notifications/route";

// ── Types ─────────────────────────────────────────────────────

type MonthEntry = { m: number; date: string; cnt: number; rmk: string };

type LeavePrt = {
  prt_no1: number;
  year_st: string;
  year_stdate: string;
  hurry_date: string;
  year_alday: number;
  year_emday: number;
  year_reday: number;
  months: MonthEntry[];
};

type LeaveEmpInfo = {
  emp_name: string;
  dpt_name: string;
  corp_name: string;
  emp_position_name: string;
  first_date: string;
};

type LeaveDetailState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; prt: LeavePrt; emp: LeaveEmpInfo };

// ── Helpers ───────────────────────────────────────────────────

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

function fmtDate(d: string) {
  if (!d || d.length < 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function fmtDateDot(d: string) {
  if (!d || d.length < 8) return d;
  return `${d.slice(0, 4)}. ${d.slice(4, 6)}. ${d.slice(6, 8)}`;
}

function parsePrt(raw: Record<string, unknown>): LeavePrt {
  return {
    prt_no1:     Number(raw.prt_no1 ?? 0),
    year_st:     String(raw.year_st ?? ""),
    year_stdate: String(raw.year_stdate ?? ""),
    hurry_date:  String(raw.hurry_date ?? ""),
    year_alday:  Number(raw.year_alday ?? 0),
    year_emday:  Number(raw.year_emday ?? 0),
    year_reday:  Number(raw.year_reday ?? 0),
    months: Array.from({ length: 12 }, (_, i) => i + 1)
      .filter((m) => raw[`m${m}_date`])
      .map((m) => ({
        m,
        date: String(raw[`m${m}_date`] ?? ""),
        cnt:  Number(raw[`m${m}_cnt`]  ?? 0),
        rmk:  String(raw[`m${m}_rmk`]  ?? ""),
      })),
  };
}

// ── 연차 명세서 시트 ──────────────────────────────────────────

function LeaveNotifySheet({
  notification,
  onClose,
}: {
  notification: NotificationRow;
  onClose: () => void;
}) {
  const user         = useAuthStore((s) => s.user);
  const companyCode  = user?.companyCode ?? "";
  const corpCode     = user?.corp_code   ?? "";
  const empCode      = user?.emp_code    ?? "";

  const refData = notification.ref_data as { yearSt?: string; prtNo1?: number } | null;
  const yearSt  = refData?.yearSt  ?? "";
  const prtNo1  = refData?.prtNo1  ?? 0;

  const [state, setState] = useState<LeaveDetailState>({ status: "loading" });

  const fetchLeaveDetail = useCallback(async () => {
    if (!companyCode || !corpCode || !empCode || !yearSt) {
      setState({ status: "error" });
      return;
    }
    setState({ status: "loading" });
    try {
      const sharedParams = { companyCode, corpCode, empCode, year: yearSt, dptCode: " ", empStatus: " ", yearStdate: " ", hurryDate: " " };

      // DETAIL: 명세 데이터
      const detailParams = new URLSearchParams({ ...sharedParams, mode: "DETAIL" });
      const detailRes = await fetch(`/api/leave/notify?${detailParams}`);
      const detailData: { items?: Record<string, unknown>[] } = await detailRes.json();
      const prtList = (detailData.items ?? []).map(parsePrt);
      const prt = prtList.find((p) => p.prt_no1 === prtNo1) ?? prtList[0];

      if (!prt) {
        setState({ status: "error" });
        return;
      }

      // LIST: 직원 상세 (직책, 입사일) - 본인 emp_code로 필터
      const listParams = new URLSearchParams({ ...sharedParams, mode: "LIST" });
      const listRes = await fetch(`/api/leave/notify?${listParams}`);
      const listData: { items?: Record<string, unknown>[] } = await listRes.json();
      const empRaw = listData.items?.[0] ?? {};

      const emp: LeaveEmpInfo = {
        emp_name:          user?.emp_name  || String(empRaw.emp_name  ?? ""),
        dpt_name:          user?.dpt_name  || String(empRaw.dpt_name  ?? ""),
        corp_name:         user?.corp_name || String(empRaw.corp_name ?? ""),
        emp_position_name: String(empRaw.emp_position_name ?? ""),
        first_date:        String(empRaw.first_date ?? ""),
      };

      setState({ status: "ok", prt, emp });
    } catch {
      setState({ status: "error" });
    }
  }, [companyCode, corpCode, empCode, yearSt, prtNo1, user]);

  useEffect(() => {
    fetchLeaveDetail();
  }, [fetchLeaveDetail]);

  const today = format(new Date(), "yyyy.MM.dd", { locale: ko });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 top-[5%] z-50 flex flex-col bg-white rounded-t-2xl shadow-xl">

        {/* 시트 헤더 */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-gray-900">{notification.title}</span>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          {state.status === "loading" && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
              <p className="text-sm">명세 정보를 불러올 수 없습니다</p>
              <button
                onClick={fetchLeaveDetail}
                className="text-xs text-primary font-medium px-4 py-2 rounded-lg border border-primary/30"
              >
                다시 시도
              </button>
            </div>
          )}

          {state.status === "ok" && (() => {
            const { prt, emp } = state;
            return (
              <div className="px-5 pt-6 pb-12 space-y-5">

                {/* 문서 제목 */}
                <div className="border-2 border-gray-700 rounded-lg py-3 text-center">
                  <p className="text-base font-bold text-gray-900 tracking-wider">(미)사용 연차일수 알림</p>
                </div>

                {/* 사업장 */}
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-600">
                    사업장: <span className="font-medium text-gray-800">{emp.corp_name}</span>
                  </span>
                </div>

                {/* 직원 정보 + 연차 현황 테이블 */}
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  {/* 헤더 행 */}
                  <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-200">
                    {["성명", "부서", "직책"].map((h) => (
                      <div key={h} className="px-3 py-2 text-xs font-semibold text-gray-600 text-center border-r border-gray-200 last:border-r-0">
                        {h}
                      </div>
                    ))}
                  </div>
                  {/* 값 행 */}
                  <div className="grid grid-cols-3 border-b border-gray-200">
                    {[emp.emp_name, emp.dpt_name, emp.emp_position_name || "—"].map((v, i) => (
                      <div key={i} className="px-3 py-2.5 text-sm text-gray-800 text-center font-medium border-r border-gray-200 last:border-r-0">
                        {v}
                      </div>
                    ))}
                  </div>

                  {/* 헤더 행 2 */}
                  <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-200">
                    {["입사일", "발생연차", "사용연차", "미사용연차"].map((h) => (
                      <div key={h} className="px-2 py-2 text-xs font-semibold text-gray-600 text-center border-r border-gray-200 last:border-r-0">
                        {h}
                      </div>
                    ))}
                  </div>
                  {/* 값 행 2 */}
                  <div className="grid grid-cols-4">
                    <div className="px-2 py-2.5 text-xs text-gray-800 text-center font-medium border-r border-gray-200">
                      {fmtDate(emp.first_date) || "—"}
                    </div>
                    <div className="px-2 py-2.5 text-sm text-gray-800 text-center font-semibold border-r border-gray-200">
                      {prt.year_alday}일
                    </div>
                    <div className="px-2 py-2.5 text-sm text-gray-800 text-center font-semibold border-r border-gray-200">
                      {prt.year_emday}일
                    </div>
                    <div className="px-2 py-2.5 text-sm text-center font-bold text-red-500">
                      {prt.year_reday}일
                    </div>
                  </div>
                </div>

                {/* 월별 사용 내역 테이블 */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">월별 연차 사용 내역</p>
                  <div className="border border-gray-300 rounded-lg overflow-hidden">
                    {/* 헤더 */}
                    <div className="grid grid-cols-[2rem_1fr_2.5rem_1fr] bg-gray-50 border-b border-gray-200">
                      {["월", "사용일자", "일수", "비고"].map((h) => (
                        <div key={h} className="px-2 py-2 text-xs font-semibold text-gray-600 text-center border-r border-gray-200 last:border-r-0">
                          {h}
                        </div>
                      ))}
                    </div>
                    {/* 12개월 행 */}
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const entry = prt.months.find((x) => x.m === m);
                      const hasDays = !!entry;
                      return (
                        <div
                          key={m}
                          className={`grid grid-cols-[2rem_1fr_2.5rem_1fr] border-b border-gray-100 last:border-b-0 ${hasDays ? "bg-white" : "bg-gray-50/50"}`}
                        >
                          <div className={`px-2 py-2 text-xs text-center border-r border-gray-200 font-medium ${hasDays ? "text-primary" : "text-gray-300"}`}>
                            {m}
                          </div>
                          <div className={`px-2 py-2 text-xs text-center border-r border-gray-200 ${hasDays ? "text-gray-700" : "text-gray-300"}`}>
                            {entry ? entry.date : "—"}
                          </div>
                          <div className={`px-2 py-2 text-xs text-center border-r border-gray-200 font-semibold ${hasDays ? "text-gray-800" : "text-gray-300"}`}>
                            {entry ? `${entry.cnt}` : "—"}
                          </div>
                          <div className={`px-2 py-2 text-xs text-center ${hasDays ? "text-gray-500" : "text-gray-300"}`}>
                            {entry?.rmk || "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 안내 문구 */}
                <div className="border border-gray-300 rounded-lg px-4 py-3">
                  <ol className="list-decimal list-outside pl-4 space-y-2 text-xs text-gray-700 leading-relaxed">
                    <li>
                      귀하께서는 {fmtDateDot(prt.year_stdate)} 현재까지 사용하지 않은 연차 유급휴가가{" "}
                      <span className="font-semibold">{prt.year_reday} 일</span>임을 알려드립니다.
                    </li>
                    <li>
                      회사의 사용촉구에도 연차 유급휴가를 사용하지 않을 경우에는 연차휴가 미사용수당이
                      지급되지 않음을 알려드립니다. 연차 유급 휴가를 적극적으로 사용해 주시기 바랍니다.
                    </li>
                  </ol>
                </div>

                {/* 날짜 + 회사명 */}
                <div className="text-center space-y-1 pt-2 pb-4">
                  <p className="text-sm text-gray-500">{today}</p>
                  <p className="text-sm font-semibold text-gray-800">{emp.corp_name}</p>
                </div>

              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────

export default function NotificationsPage() {
  return (
    <Suspense>
      <NotificationsContent />
    </Suspense>
  );
}

function NotificationsContent() {
  const companyCode  = useAuthStore((s) => s.user?.companyCode ?? "");
  const empCode      = useAuthStore((s) => s.user?.emp_code ?? "");
  const { items, loading, setItems, markOneRead } = useNotificationStore();
  const [detail, setDetail] = useState<NotificationRow | null>(null);
  const searchParams = useSearchParams();
  const deepLinkId   = searchParams.get("id") ? Number(searchParams.get("id")) : null;

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

  useEffect(() => {
    if (!deepLinkId || items.length === 0) return;
    const target = items.find((n) => n.id === deepLinkId);
    if (target) handleClick(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, items]);

  function handleClick(n: NotificationRow) {
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

  const isLeaveNotify = detail?.type === "leave_notify";

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">알림</h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
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

      {/* 연차 명세서 시트 */}
      {detail && isLeaveNotify && (
        <LeaveNotifySheet
          notification={detail}
          onClose={() => setDetail(null)}
        />
      )}

      {/* 일반 알림 상세 팝업 */}
      {detail && !isLeaveNotify && (
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
