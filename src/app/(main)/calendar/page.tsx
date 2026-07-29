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
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { fetchCompanyHolidays, fetchHolidayList } from "@/features/leave/api";
import type { HolidayListItem } from "@/features/leave/api";
import type { CalScdRow } from "@/app/api/schedule-crud/route";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function apiYmdToIsoDate(dateStr: string) {
  const n = dateStr.replace(/-/g, "");
  if (n.length < 8) return dateStr;
  return `${n.slice(0, 4)}-${n.slice(4, 6)}-${n.slice(6, 8)}`;
}

function isValidYmdStr(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const n = dateStr.replace(/-/g, "");
  if (n.length < 8) return false;
  const y = Number(n.slice(0, 4));
  const m = Number(n.slice(4, 6));
  const d = Number(n.slice(6, 8));
  if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
  const dt = new Date(y, m - 1, d);
  return !isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
}

function apiYmdToDate(dateStr: string) {
  const n = dateStr.replace(/-/g, "");
  const y = Number(n.slice(0, 4));
  const m = Number(n.slice(4, 6));
  const d = Number(n.slice(6, 8));
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function expandLeaveItemToDayKeys(item: HolidayListItem): string[] {
  if (!isValidYmdStr(item.year_bdate) || !isValidYmdStr(item.year_edate)) return [];
  const start = apiYmdToDate(item.year_bdate);
  const end = apiYmdToDate(item.year_edate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
  try {
    return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
  } catch {
    return [];
  }
}


function isHiddenPublicHolidayLabel(holidayName: string) {
  return holidayName.trim() === "정기";
}

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

export default function CalendarPage() {
  const user = useAuthStore((s) => s.user);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filter, setFilter] = useState<"all" | "휴가" | "일정">("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const calendarYear = String(getYear(currentMonth));

  function prevMonth() {
    setCurrentMonth((p) => subMonths(p, 1));
    setSelectedDate(null);
  }
  function nextMonth() {
    setCurrentMonth((p) => addMonths(p, 1));
    setSelectedDate(null);
  }

  const { data: companyHolidays = [] } = useQuery({
    queryKey: ["companyHolidays", user?.companyCode, user?.corp_code, calendarYear],
    queryFn: async () => {
      if (!user?.companyCode || !user?.corp_code) return [];
      const result = await fetchCompanyHolidays(user.companyCode, user.corp_code, calendarYear);
      if (result.success) return result.data;
      return [];
    },
    enabled: !!user?.companyCode && !!user?.corp_code,
  });

  const { data: myLeaveItems = [] } = useQuery({
    queryKey: ["calendar-my-leaves", user?.companyCode, user?.corp_code, user?.emp_code, calendarYear],
    queryFn: async () => {
      if (!user?.companyCode || !user.corp_code || !user.emp_code) return [];
      const result = await fetchHolidayList(user.companyCode, user.corp_code, calendarYear, user.emp_code);
      if (result.success === false) return [];
      return result.items;
    },
    enabled: !!user?.companyCode && !!user?.corp_code && !!user?.emp_code,
  });

  const { data: mySchedules = [] } = useQuery<CalScdRow[]>({
    queryKey: ["calendar-my-schedules", user?.companyCode, user?.emp_code, format(currentMonth, "yyyyMM")],
    queryFn: async () => {
      if (!user?.companyCode || !user?.emp_code) return [];
      const params = new URLSearchParams({
        companyCode: user.companyCode,
        empCode: user.emp_code,
        startDate: format(startOfMonth(currentMonth), "yyyyMMdd"),
        endDate: format(endOfMonth(currentMonth), "yyyyMMdd"),
      });
      const res = await fetch(`/api/schedule-crud?${params.toString()}`);
      if (!res.ok) return [];
      const data: { items: CalScdRow[] } = await res.json();
      return data.items ?? [];
    },
    enabled: !!user?.companyCode && !!user?.emp_code,
  });

  const holidayMap = useMemo(() => {
    return new Map(
      companyHolidays
        .filter(({ holiday_name }) => !isHiddenPublicHolidayLabel(holiday_name))
        .map(({ hdate, holiday_name }) => [apiYmdToIsoDate(hdate), holiday_name]),
    );
  }, [companyHolidays]);

  const myLeaveDayMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const item of myLeaveItems) {
      for (const dayKey of expandLeaveItemToDayKeys(item)) {
        const list = m.get(dayKey) ?? [];
        if (!list.includes(item.holiday_typ)) list.push(item.holiday_typ);
        m.set(dayKey, list);
      }
    }
    return m;
  }, [myLeaveItems]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  const monthPrefix = useMemo(() => {
    const y = getYear(currentMonth);
    const m = getMonth(currentMonth) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }, [currentMonth]);

  const monthHolidays = useMemo(() => {
    return Array.from(holidayMap.entries())
      .filter(([dateStr]) => dateStr.startsWith(monthPrefix))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [holidayMap, monthPrefix]);

  const myScheduleDayMap = useMemo(() => {
    const m = new Set<string>();
    for (const item of mySchedules) {
      if (!isValidYmdStr(item.beg_date) || !isValidYmdStr(item.end_date)) continue;
      const start = apiYmdToDate(item.beg_date);
      const end = apiYmdToDate(item.end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) continue;
      try {
        for (const d of eachDayOfInterval({ start, end })) m.add(format(d, "yyyy-MM-dd"));
      } catch { /* ignore */ }
    }
    return m;
  }, [mySchedules]);

  type MonthEvent = {
    dateStr: string;
    endDateStr?: string;
    kind: "holiday" | "leave" | "schedule";
    title: string;
    time?: string;
    remark?: string;
  };

  const monthEvents = useMemo((): MonthEvent[] => {
    const holidayEv: MonthEvent[] = monthHolidays.map(([dateStr, name]) => ({
      dateStr, kind: "holiday" as const, title: name,
    }));
    const leaveEv: MonthEvent[] = myLeaveItems
      .filter((item) => apiYmdToIsoDate(item.year_bdate).startsWith(monthPrefix))
      .map((item) => ({
        dateStr: apiYmdToIsoDate(item.year_bdate),
        endDateStr: item.year_edate !== item.year_bdate ? apiYmdToIsoDate(item.year_edate) : undefined,
        kind: "leave" as const,
        title: item.holiday_typ,
      }));
    const scheduleEv: MonthEvent[] = mySchedules
      .filter((item) => isValidYmdStr(item.beg_date) && isValidYmdStr(item.end_date))
      .map((item) => ({
        dateStr: apiYmdToIsoDate(item.beg_date),
        endDateStr: item.end_date !== item.beg_date ? apiYmdToIsoDate(item.end_date) : undefined,
        kind: "schedule" as const,
        title: item.scd_name,
        time: item.scd_time || undefined,
        remark: item.scd_remark || undefined,
      }));
    return [...holidayEv, ...leaveEv, ...scheduleEv].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [monthHolidays, myLeaveItems, mySchedules, monthPrefix]);

  const filteredEvents = useMemo(() => {
    if (filter === "휴가") return monthEvents.filter((e) => e.kind === "leave");
    if (filter === "일정") return monthEvents.filter((e) => e.kind === "schedule");
    return monthEvents;
  }, [monthEvents, filter]);

  const displayEvents = useMemo(() => {
    if (!selectedDate) return filteredEvents;
    return filteredEvents.filter((ev) => {
      const end = ev.endDateStr ?? ev.dateStr;
      return ev.dateStr <= selectedDate && selectedDate <= end;
    });
  }, [filteredEvents, selectedDate]);

  const listTitle = selectedDate
    ? format(new Date(`${selectedDate}T12:00:00`), "M월 d일 일정", { locale: ko })
    : format(currentMonth, "M월 일정", { locale: ko });

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">캘린더 <span className="text-sm font-normal text-gray-400">(내 일정)</span></h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-4 mt-4">
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
                const dayOfWeek = getDay(day);
                const hasPublicHoliday = holidayMap.has(dayKey);
                const hasMyLeave = myLeaveDayMap.has(dayKey);
                const isSunday = dayOfWeek === 0;
                const isSaturday = dayOfWeek === 6;
                const isRed = isSunday || hasPublicHoliday;
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
                      !isSelected && !isToday && isRed && "text-red-400",
                      !isSelected && !isToday && !isRed && isSaturday && "text-blue-400",
                      !isSelected && !isToday && !isRed && !isSaturday && "text-gray-700",
                    )}>
                      {format(day, "d")}
                    </span>
                    <div className="flex items-center justify-center gap-0.5 min-h-2 mt-0.5">
                      {hasPublicHoliday && <span className="w-1 h-1 rounded-full bg-red-300 shrink-0" />}
                      {hasMyLeave && <span className="w-1 h-1 rounded-full bg-indigo-400 shrink-0" />}
                      {myScheduleDayMap.has(dayKey) && (
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: "#7abf82" }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mx-4 mt-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-700">{listTitle}</span>
            {monthEvents.length > 0 && (
              <span className="text-xs font-medium text-white bg-gray-700 rounded-full px-2 py-0.5">
                {displayEvents.length}건
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
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

          {displayEvents.length > 0 ? (
            <div className="flex flex-col gap-2">
              {displayEvents.map((ev) => {
                const isHoliday = ev.kind === "holiday";
                const isLeave   = ev.kind === "leave";
                const bg    = isHoliday ? "#fff1f2" : isLeave ? "#eef2ff" : "#edf7ee";
                const bdr   = isHoliday ? "#fecdd3" : isLeave ? "#c7d2fe" : "#c8e6ca";
                const dot   = isHoliday ? "#f87171" : isLeave ? "#6366f1" : "#7abf82";
                const color = isHoliday ? "#ef4444" : isLeave ? "#6366f1" : "#4a9e5c";
                if (!ev.dateStr || ev.dateStr.length < 10) return null;
                const startDt = new Date(`${ev.dateStr}T12:00:00`);
                if (isNaN(startDt.getTime())) return null;
                const dateLabel = format(startDt, "M월 d일 (eee)", { locale: ko });
                const endDt = ev.endDateStr ? new Date(`${ev.endDateStr}T12:00:00`) : null;
                const endLabel = endDt && !isNaN(endDt.getTime())
                  ? ` ~ ${format(endDt, "M월 d일 (eee)", { locale: ko })}` : "";

                return (
                  <div
                    key={`${ev.dateStr}-${ev.kind}-${ev.title}`}
                    className="rounded-xl border px-4 py-3 shadow-sm flex items-center gap-3"
                    style={{ backgroundColor: bg, borderColor: bdr }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-xs truncate" style={{ color }}>
                          {dateLabel}{endLabel}
                          {isHoliday && <span className="text-gray-400 font-normal"> · 공휴일</span>}
                        </span>
                        {ev.time ? <span className="text-xs text-gray-800 shrink-0">{ev.time}</span> : null}
                      </div>
                      <p className="text-sm text-gray-900 break-words">{ev.title}</p>
                      {ev.remark ? <p className="mt-0.5 text-xs text-gray-500 break-words">{ev.remark}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-6 shadow-sm flex flex-col items-center gap-2">
              <CalendarDays className="w-8 h-8 text-gray-200" />
              <p className="text-sm text-gray-400">
                {selectedDate
                  ? "해당 날짜에 일정이 없습니다"
                  : filter === "all" ? "이번 달 일정이 없습니다" : `이번 달 ${filter}이 없습니다`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
