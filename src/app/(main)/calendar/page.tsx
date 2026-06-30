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

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function apiYmdToIsoDate(dateStr: string) {
  const n = dateStr.replace(/-/g, "");
  if (n.length < 8) return dateStr;
  return `${n.slice(0, 4)}-${n.slice(4, 6)}-${n.slice(6, 8)}`;
}

function apiYmdToDate(dateStr: string) {
  const n = dateStr.replace(/-/g, "");
  return new Date(
    Number(n.slice(0, 4)),
    Number(n.slice(4, 6)) - 1,
    Number(n.slice(6, 8)),
  );
}

function expandLeaveItemToDayKeys(item: HolidayListItem): string[] {
  const start = apiYmdToDate(item.year_bdate);
  const end = apiYmdToDate(item.year_edate);
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

function isLeaveConfirmed(item: HolidayListItem) {
  return String(item.year_chk ?? "").toUpperCase() === "Y";
}

/** 캘린더 공휴일 표시 제외 (회사 휴일명이 정기인 경우) */
function isHiddenPublicHolidayLabel(holidayName: string) {
  return holidayName.trim() === "정기";
}

export default function CalendarPage() {
  const user = useAuthStore((s) => s.user);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const calendarYear = String(getYear(currentMonth));

  const { data: companyHolidays = [] } = useQuery({
    queryKey: [
      "companyHolidays",
      user?.companyCode,
      user?.corp_code,
      calendarYear,
    ],
    queryFn: async () => {
      if (!user?.companyCode || !user?.corp_code) return [];
      const result = await fetchCompanyHolidays(
        user.companyCode,
        user.corp_code,
        calendarYear,
      );
      if (result.success) return result.data;
      return [];
    },
    enabled: !!user?.companyCode && !!user?.corp_code,
  });

  const { data: myLeaveItems = [] } = useQuery({
    queryKey: [
      "calendar-my-leaves",
      user?.companyCode,
      user?.corp_code,
      user?.emp_code,
      calendarYear,
    ],
    queryFn: async () => {
      if (!user?.companyCode || !user.corp_code || !user.emp_code) return [];
      const result = await fetchHolidayList(
        user.companyCode,
        user.corp_code,
        calendarYear,
        user.emp_code,
      );
      if (result.success === false) return [];
      return result.items.filter(isLeaveConfirmed);
    },
    enabled: !!user?.companyCode && !!user?.corp_code && !!user?.emp_code,
  });

  /** hdate "20260101" → { "2026-01-01": "신정" } Map (이름이 정기인 공휴일 제외) */
  const holidayMap = useMemo(() => {
    return new Map(
      companyHolidays
        .filter(({ holiday_name }) => !isHiddenPublicHolidayLabel(holiday_name))
        .map(({ hdate, holiday_name }) => [
          apiYmdToIsoDate(hdate),
          holiday_name,
        ]),
    );
  }, [companyHolidays]);

  /** 확정 연차( year_chk Y )일자 → 구분 라벨 (같은 날 여러 건 병합) */
  const myLeaveDayMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const item of myLeaveItems) {
      for (const dayKey of expandLeaveItemToDayKeys(item)) {
        const list = m.get(dayKey) ?? [];
        if (!list.includes(item.holiday_typ)) {
          list.push(item.holiday_typ);
        }
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

  /** 현재 보고 있는 달의 공휴일만 필터링 (날짜 오름차순) */
  const monthHolidays = useMemo(() => {
    return Array.from(holidayMap.entries())
      .filter(([dateStr]) => dateStr.startsWith(monthPrefix))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [holidayMap, monthPrefix]);

  /** 같은 달 확정 연차 일자 (날짜 오름차순) */
  const monthMyLeaveDays = useMemo(() => {
    return Array.from(myLeaveDayMap.entries())
      .filter(([dateStr]) => dateStr.startsWith(monthPrefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, types]) => [dateStr, types.join(" · ")] as const);
  }, [myLeaveDayMap, monthPrefix]);

  type MonthEvent = {
    dateStr: string;
    kind: "public" | "leave";
    title: string;
  };

  const monthEvents = useMemo((): MonthEvent[] => {
    const publicEv: MonthEvent[] = monthHolidays.map(([dateStr, name]) => ({
      dateStr,
      kind: "public" as const,
      title: name,
    }));
    const leaveEv: MonthEvent[] = monthMyLeaveDays.map(([dateStr, title]) => ({
      dateStr,
      kind: "leave" as const,
      title,
    }));
    const merged = [...publicEv, ...leaveEv].sort((a, b) =>
      a.dateStr.localeCompare(b.dateStr),
    );
    return merged;
  }, [monthHolidays, monthMyLeaveDays]);

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">캘린더</h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-4 mt-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <button
            onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}
            className="p-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-bold text-gray-900 text-base">
            {format(currentMonth, "yyyy년 M월", { locale: ko })}
          </span>
          <button
            onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
            className="p-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 px-2 py-1">
          {WEEKDAY_LABELS.map((label, idx) => (
            <div
              key={label}
              className={cn(
                "text-center text-xs font-semibold py-2",
                idx === 0 && "text-red-400",
                idx === 6 && "text-blue-400",
                idx > 0 && idx < 6 && "text-gray-400",
              )}
            >
              {label}
            </div>
          ))}

          {/* 시작 패딩 */}
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}

          {/* 날짜 */}
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

            return (
              <div
                key={dayKey}
                className={cn(
                  "flex flex-col items-center justify-center py-1 mx-0.5 my-0.5 rounded-xl",
                  isToday && "bg-primary/10",
                  !isCurrentMonth && "opacity-30",
                )}
              >
                <span
                  className={cn(
                    "text-sm leading-none",
                    isToday && "font-bold text-primary",
                    !isToday && isRed && "text-red-400",
                    !isToday && !isRed && isSaturday && "text-blue-400",
                    !isToday && !isRed && !isSaturday && "text-gray-700",
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="flex items-center justify-center gap-0.5 min-h-2 mt-0.5">
                  {hasPublicHoliday ? (
                    <span
                      className="w-1 h-1 rounded-full bg-red-300 shrink-0"
                      title="공휴일"
                    />
                  ) : null}
                  {hasMyLeave ? (
                    <span
                      className="w-1 h-1 rounded-full bg-indigo-400 shrink-0"
                      title="연차"
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
          </div>
        </div>

        {/* 해당 월 일정 목록 (공휴일 + 확정 연차) */}
        <div className="mx-4 mt-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-700">
            {format(currentMonth, "M월 일정", { locale: ko })}
          </span>
          {monthEvents.length > 0 && (
            <span className="text-xs font-medium text-white bg-gray-700 rounded-full px-2 py-0.5">
              {monthEvents.length}건
            </span>
          )}
        </div>

        {monthEvents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {monthEvents.map((ev) => (
              <div
                key={`${ev.dateStr}-${ev.kind}-${ev.title}`}
                className={cn(
                  "rounded-xl border px-4 py-3 shadow-sm flex items-center gap-3",
                  ev.kind === "public" && "bg-red-50 border-red-100",
                  ev.kind === "leave" && "bg-indigo-50 border-indigo-100",
                )}
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    ev.kind === "public" && "bg-red-400",
                    ev.kind === "leave" && "bg-indigo-500",
                  )}
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    className={cn(
                      "text-xs",
                      ev.kind === "public" && "text-red-400",
                      ev.kind === "leave" && "text-indigo-500",
                    )}
                  >
                    {format(
                      new Date(`${ev.dateStr}T12:00:00`),
                      "M월 d일 (eee)",
                      {
                        locale: ko,
                      },
                    )}
                    {ev.kind === "public" ? (
                      <span className="text-gray-400 font-normal">
                        {" "}
                        · 공휴일
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium break-words",
                      ev.kind === "public" && "text-red-600",
                      ev.kind === "leave" && "text-indigo-900",
                    )}
                  >
                    {ev.title}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-6 shadow-sm flex flex-col items-center gap-2">
            <CalendarDays className="w-8 h-8 text-gray-200" />
            <p className="text-sm text-gray-400">이번 달 일정이 없습니다</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
