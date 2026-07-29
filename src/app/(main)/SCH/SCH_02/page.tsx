"use client";

import { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  getDay,
  getYear,
  getMonth,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarSearch, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useMenuTitle } from "@/features/menu/use-menu-store";
import type { AllHolidayListItem } from "@/app/api/leave/all-holiday-list/route";
import type { CalScdItem } from "@/app/api/schedule/route";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function ymdNorm(s: string) { return s.replace(/-/g, ""); }

function ymdToDate(dateStr: string) {
  const n = ymdNorm(dateStr);
  return new Date(Number(n.slice(0, 4)), Number(n.slice(4, 6)) - 1, Number(n.slice(6, 8)));
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function ymdToKoDate(dateStr: string): string {
  try {
    const d = ymdToDate(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_KO[d.getDay()]})`;
  } catch { return dateStr; }
}

function expandToDayKeys(begDate: string, endDate: string): string[] {
  try {
    return eachDayOfInterval({ start: ymdToDate(begDate), end: ymdToDate(endDate) })
      .map((d) => format(d, "yyyy-MM-dd"));
  } catch { return []; }
}

type DisplayItem =
  | { kind: "schedule"; emp_code: string; beg_date: string; end_date: string; emp_name?: string; title: string; time?: string; remark?: string; key: string }
  | { kind: "leave";    emp_code: string; beg_date: string; end_date: string; emp_name?: string; title: string; key: string };

const FILTER_ACTIVE: Record<"all" | "휴가" | "일정", React.CSSProperties> = {
  all:  { backgroundColor: "#374151", color: "#fff", fontWeight: 700 },
  휴가: { backgroundColor: "#6366f1", color: "#fff", fontWeight: 700 },
  일정: { backgroundColor: "#4a9e5c", color: "#fff", fontWeight: 700 },
};
const FILTER_INACTIVE: Record<"all" | "휴가" | "일정", React.CSSProperties> = {
  all:  { backgroundColor: "#f3f4f6", color: "#6b7280" },
  휴가: { backgroundColor: "#eef2ff", color: "#6366f1" },
  일정: { backgroundColor: "#edf7ee", color: "#4a9e5c" },
};

export default function ScheduleListPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const pageTitle = useMenuTitle("SCH_02", "전체 일정 조회");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filter, setFilter] = useState<"all" | "휴가" | "일정">("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [myOnly, setMyOnly] = useState(false);

  function prevMonth() {
    setCurrentMonth((p) => subMonths(p, 1));
    setSelectedDate(null);
  }
  function nextMonth() {
    setCurrentMonth((p) => addMonths(p, 1));
    setSelectedDate(null);
  }

  const yearMonth = useMemo(() => {
    const y = getYear(currentMonth);
    const m = getMonth(currentMonth) + 1;
    return `${y}${String(m).padStart(2, "0")}`;
  }, [currentMonth]);

  const calendarYear = useMemo(() => String(getYear(currentMonth)), [currentMonth]);

  const monthPrefix = useMemo(() => {
    const y = getYear(currentMonth);
    const m = getMonth(currentMonth) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }, [currentMonth]);

  const { data: scheduleItems = [], isLoading: schedLoading } = useQuery({
    queryKey: ["sch02-cal-scd", user?.companyCode, yearMonth],
    queryFn: async () => {
      if (!user?.companyCode) return [];
      const params = new URLSearchParams({ companyCode: user.companyCode, yearMonth });
      const res = await fetch(`/api/schedule?${params.toString()}`);
      if (!res.ok) return [];
      const data: { items: CalScdItem[] } = await res.json();
      return data.items ?? [];
    },
    enabled: !!user?.companyCode,
  });

  const { data: leaveItems = [], isLoading: leaveLoading } = useQuery<AllHolidayListItem[]>({
    queryKey: ["sch02-all-leave", user?.companyCode, user?.corp_code, calendarYear],
    queryFn: async () => {
      if (!user?.companyCode || !user?.corp_code) return [];
      const params = new URLSearchParams({
        companyCode: user.companyCode,
        corp_code:   user.corp_code,
        year:        calendarYear,
      });
      const res = await fetch(`/api/leave/all-holiday-list?${params.toString()}`);
      if (!res.ok) return [];
      const data: { items: AllHolidayListItem[] } = await res.json();
      return data.items ?? [];
    },
    enabled: !!user?.companyCode && !!user?.corp_code,
  });

  const isLoading = schedLoading || leaveLoading;

  /* ── 캘린더 dot용 dayMap (myOnly 적용) ── */
  const scheduleDayMap = useMemo(() => {
    const m = new Set<string>();
    const items = myOnly ? scheduleItems.filter((i) => i.emp_code === user?.emp_code) : scheduleItems;
    for (const item of items) {
      for (const dk of expandToDayKeys(item.beg_date, item.end_date)) {
        if (dk.startsWith(monthPrefix)) m.add(dk);
      }
    }
    return m;
  }, [scheduleItems, monthPrefix, myOnly, user?.emp_code]);

  const leaveDayMap = useMemo(() => {
    const m = new Set<string>();
    const items = myOnly ? leaveItems.filter((i) => i.emp_code === user?.emp_code) : leaveItems;
    for (const item of items) {
      if (!item.year_bdate || !item.year_edate) continue;
      for (const dk of expandToDayKeys(item.year_bdate, item.year_edate)) {
        if (dk.startsWith(monthPrefix)) m.add(dk);
      }
    }
    return m;
  }, [leaveItems, monthPrefix, myOnly, user?.emp_code]);

  const monthItems = useMemo((): DisplayItem[] => {
    const sched: DisplayItem[] = scheduleItems.map((i) => ({
      kind: "schedule",
      emp_code: i.emp_code,
      beg_date: i.beg_date,
      end_date: i.end_date,
      emp_name: i.emp_name,
      title: i.scd_name,
      time: i.scd_time || undefined,
      remark: i.scd_remark || undefined,
      key: `scd-${i.emp_code}-${i.scd_no1}`,
    }));

    const leave: DisplayItem[] = leaveItems
      .filter((i) => i.year_bdate && ymdNorm(i.year_bdate).startsWith(yearMonth))
      .map((i) => ({
        kind: "leave" as const,
        emp_code:  i.emp_code,
        beg_date:  i.year_bdate,
        end_date:  i.year_edate,
        emp_name:  i.emp_name,
        title:     i.holiday_typ,
        key:       `leave-${i.emp_code}-${i.year_bdate}`,
      }));

    return [...sched, ...leave].sort((a, b) => ymdNorm(a.beg_date).localeCompare(ymdNorm(b.beg_date)));
  }, [scheduleItems, leaveItems, yearMonth]);

  const filteredItems = useMemo(() => {
    let items = monthItems;
    if (filter === "휴가") items = items.filter((i) => i.kind === "leave");
    else if (filter === "일정") items = items.filter((i) => i.kind === "schedule");
    if (myOnly) items = items.filter((i) => i.emp_code === user?.emp_code);
    if (selectedDate) {
      const dk = selectedDate.replace(/-/g, "");
      items = items.filter((i) => {
        const start = ymdNorm(i.beg_date);
        const end = ymdNorm(i.end_date);
        return start <= dk && dk <= end;
      });
    }
    return items;
  }, [monthItems, filter, myOnly, selectedDate, user?.emp_code]);

  const listTitle = selectedDate
    ? format(new Date(`${selectedDate}T12:00:00`), "M월 d일 일정", { locale: ko })
    : format(currentMonth, "M월 일정", { locale: ko });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <CalendarSearch className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">{pageTitle}</h1>
          </div>
        </div>
      </header>

      {/* 스크롤 영역: 캘린더 + 목록 함께 스크롤 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      {/* 캘린더 */}
      <div className="mx-4 mt-4 mb-2">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <span className="font-bold text-gray-900 text-base">
              {format(currentMonth, "yyyy년 M월", { locale: ko })}
            </span>
            <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 px-2 py-1">
            {WEEKDAY_LABELS.map((label, idx) => (
              <div key={label} className={cn(
                "text-center text-xs font-semibold py-2",
                idx === 0 && "text-red-400",
                idx === 6 && "text-blue-400",
                idx > 0 && idx < 6 && "text-gray-400",
              )}>
                {label}
              </div>
            ))}

            {Array.from({ length: startPadding }).map((_, i) => <div key={`pad-${i}`} />)}

            {days.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const dow = getDay(day);
              const isSelected = dayKey === selectedDate;
              return (
                <div
                  key={dayKey}
                  onClick={() => setSelectedDate((prev) => prev === dayKey ? null : dayKey)}
                  className={cn(
                    "flex flex-col items-center justify-center py-1 mx-0.5 my-0.5 rounded-xl cursor-pointer active:opacity-70 transition-colors",
                    isSelected && "ring-1 ring-inset ring-indigo-400 bg-indigo-50",
                    !isSelected && isToday && "bg-primary/10",
                    !isCurrentMonth && "opacity-30",
                  )}
                >
                  <span className={cn(
                    "text-sm leading-none",
                    isSelected && "font-bold text-indigo-600",
                    !isSelected && isToday && "font-bold text-primary",
                    !isSelected && !isToday && dow === 0 && "text-red-400",
                    !isSelected && !isToday && dow === 6 && "text-blue-400",
                    !isSelected && !isToday && dow > 0 && dow < 6 && "text-gray-700",
                  )}>
                    {format(day, "d")}
                  </span>
                  <div className="flex items-center justify-center gap-0.5 min-h-2 mt-0.5">
                    {leaveDayMap.has(dayKey) && (
                      <span className="w-1 h-1 rounded-full bg-indigo-400 shrink-0" />
                    )}
                    {scheduleDayMap.has(dayKey) && (
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: "#7abf82" }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 목록 헤더 */}
      <div className="shrink-0 mx-4 mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-gray-700">{listTitle}</span>
        {monthItems.length > 0 && (
          <span className="text-xs font-medium text-white bg-gray-700 rounded-full px-2 py-0.5">
            {filteredItems.length}건
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setMyOnly((v) => !v)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
            style={myOnly
              ? { backgroundColor: "#60a5fa", color: "#fff", fontWeight: 700 }
              : { backgroundColor: "#fef3c7", color: "#d97706", fontWeight: 700 }}
          >
            <User className="w-3 h-3" />
            {myOnly ? "내 일정" : "전체 일정"}
          </button>
          {(["all", "휴가", "일정"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
              style={filter === f ? FILTER_ACTIVE[f] : FILTER_INACTIVE[f]}
            >
              {f === "all" ? "휴가·일정" : f}
            </button>
          ))}
        </div>
      </div>

      {/* 카드 목록 */}
      <div>
        <div className="mx-4 mt-2 mb-4">
          {isLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-6 shadow-sm flex items-center justify-center">
              <p className="text-sm text-gray-400">불러오는 중...</p>
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="flex flex-col gap-2">
              {filteredItems.map((item) => {
                const isLeave = item.kind === "leave";
                return (
                  <div key={item.key}
                    className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={isLeave
                      ? { backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", boxShadow: "0 1px 4px 0 rgba(0,0,0,0.06)" }
                      : { backgroundColor: "#edf7ee", border: "1px solid #c8e6ca", boxShadow: "0 1px 4px 0 rgba(0,0,0,0.06)" }
                    }
                  >
                    <span className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: isLeave ? "#6366f1" : "#7abf82" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-xs truncate" style={{ color: isLeave ? "#6366f1" : "#4a9e5c" }}>
                          {ymdToKoDate(item.beg_date)}
                          {ymdNorm(item.beg_date) !== ymdNorm(item.end_date) && (
                            <span> ~ {ymdToKoDate(item.end_date)}</span>
                          )}
                          {item.emp_name ? <span className="text-gray-800"> · {item.emp_name}</span> : null}
                        </span>
                        {item.kind === "schedule" && item.time ? (
                          <span className="text-xs text-gray-800 shrink-0">{item.time}</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-gray-900 break-words">{item.title}</p>
                      {item.kind === "schedule" && item.remark ? (
                        <p className="mt-0.5 text-xs text-gray-500 break-words">{item.remark}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-6 shadow-sm flex flex-col items-center gap-2">
              <CalendarSearch className="w-8 h-8 text-gray-200" />
              <p className="text-sm text-gray-400">
                {selectedDate
                  ? "해당 날짜에 일정이 없습니다"
                  : myOnly
                  ? "내 일정이 없습니다"
                  : filter === "all" ? "이번 달 일정이 없습니다" : `이번 달 ${filter}이 없습니다`}
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
