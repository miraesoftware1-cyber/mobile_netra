"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  getYear,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import {
  fetchCompanyHolidaysByCorp,
  fetchDepartmentLeaveList,
  type DepartmentHolidayListItem,
} from "@/features/leave/api";
import { cn } from "@/lib/utils";

type DayMap = Record<string, DepartmentHolidayListItem[]>;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function parseCompactDate(value: string) {
  const normalized = value.replace(/-/g, "");
  if (normalized.length < 8) return null;
  return parse(normalized.slice(0, 8), "yyyyMMdd", new Date());
}

function toDateKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function formatPeriod(start: string, end: string) {
  const startDate = parseCompactDate(start);
  const endDate = parseCompactDate(end);
  if (!startDate || !endDate) return `${start} ~ ${end}`;
  return `${format(startDate, "M월 d일", { locale: ko })} ~ ${format(endDate, "M월 d일", { locale: ko })}`;
}

function formatRangeWithWeekday(start: string, end: string) {
  const startDate = parseCompactDate(start);
  const endDate = parseCompactDate(end);
  if (!startDate || !endDate) return `${start} ~ ${end}`;
  const startLabel = format(startDate, "M월 d일 (eee)", { locale: ko });
  const endLabel = format(endDate, "M월 d일 (eee)", { locale: ko });
  if (format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
    return startLabel;
  }
  return `${startLabel} ~ ${endLabel}`;
}

export function DepartmentLeaveCalendarView() {
  const user = useAuthStore((s) => s.user);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const calendarYear = String(getYear(currentMonth));

  const canQuery =
    !!user?.companyCode &&
    !!user?.corp_code &&
    !!user?.manage_dpt_codes;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [
      "department-leave-calendar",
      user?.corp_code,
      user?.manage_dpt_codes,
      calendarYear,
    ],
    queryFn: async () => {
      if (!user?.corp_code || !user?.manage_dpt_codes) {
        throw new Error("부서 정보가 필요합니다.");
      }
      const result = await fetchDepartmentLeaveList(
        user.companyCode,
        user.corp_code,
        user.manage_dpt_codes,
        calendarYear,
      );
      if (!result.success) {
        throw new Error("error" in result ? result.error : "조회에 실패했습니다.");
      }
      return {
        items: result.items,
        emptyMessage: result.emptyMessage,
      };
    },
    enabled: canQuery,
  });

  const { data: companyHolidayData } = useQuery({
    queryKey: ["department-company-holidays", user?.corp_code, calendarYear],
    queryFn: async () => {
      if (!user?.companyCode || !user?.corp_code) return [];
      const result = await fetchCompanyHolidaysByCorp(
        user.companyCode,
        user.corp_code,
        calendarYear,
      );
      if (!result.success) return [];
      return result.items;
    },
    enabled: !!user?.companyCode && !!user?.corp_code,
  });

  const items = data?.items ?? [];
  const companyHolidays = companyHolidayData ?? [];
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);
  const monthPrefix = format(currentMonth, "yyyy-MM");

  const leaveDayMap = useMemo<DayMap>(() => {
    const mapped: DayMap = {};
    items.forEach((item) => {
      const startDate = parseCompactDate(item.year_bdate);
      const endDate = parseCompactDate(item.year_edate);
      if (!startDate || !endDate) return;
      eachDayOfInterval({ start: startDate, end: endDate }).forEach((day) => {
        const dayOfWeek = getDay(day);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        if (isWeekend) return;
        const key = toDateKey(day);
        mapped[key] = [...(mapped[key] ?? []), item];
      });
    });
    return mapped;
  }, [items]);

  const companyHolidaySet = useMemo(() => {
    return new Set(
      companyHolidays.map(({ hdate }) => {
        const n = hdate.replace(/-/g, "");
        if (n.length < 8) return hdate;
        return `${n.slice(0, 4)}-${n.slice(4, 6)}-${n.slice(6, 8)}`;
      }),
    );
  }, [companyHolidays]);

  type MonthEvent = {
    dateStr: string;
    title: string;
    empName: string;
    dptName?: string;
    dateRangeLabel: string;
  };
  const monthEvents = useMemo((): MonthEvent[] => {
    const eventMap = new Map<string, MonthEvent>();
    items.forEach((item) => {
      const startDate = parseCompactDate(item.year_bdate);
      if (!startDate) return;
      const dateStr = toDateKey(startDate);
      if (!dateStr.startsWith(monthPrefix)) return;
      const key = `${dateStr}-${item.emp_code}-${item.holiday_typ}-${item.year_bdate}-${item.year_edate}`;
      eventMap.set(key, {
        dateStr,
        title: `${item.holiday_typ} (${item.year_emday}일)`,
        empName: item.emp_name,
        dptName: item.dpt_name?.trim() || undefined,
        dateRangeLabel: formatRangeWithWeekday(item.year_bdate, item.year_edate),
      });
    });
    return Array.from(eventMap.values()).sort((a, b) =>
      a.dateStr.localeCompare(b.dateStr),
    );
  }, [items, monthPrefix]);

  const selectedDateKey = selectedDate ? toDateKey(selectedDate) : "";
  const selectedDateRangeEvents = useMemo((): MonthEvent[] => {
    if (!selectedDate) return [];
    const dayItems = leaveDayMap[selectedDateKey] ?? [];
    return dayItems.map((item) => ({
      dateStr: selectedDateKey,
      title: `${item.holiday_typ} (${item.year_emday}일)`,
      empName: item.emp_name,
      dptName: item.dpt_name?.trim() || undefined,
      dateRangeLabel: formatRangeWithWeekday(item.year_bdate, item.year_edate),
    }));
  }, [leaveDayMap, selectedDate, selectedDateKey]);

  const selectedDateEvents = useMemo(
    () =>
      selectedDate
        ? selectedDateRangeEvents
        : monthEvents,
    [monthEvents, selectedDate, selectedDateRangeEvents],
  );

  if (!canQuery) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="h-8 w-8 text-orange-400" />
        <p className="text-sm text-gray-600">
          부서 조회 권한 정보가 없어 데이터를 불러올 수 없습니다. 다시 로그인해 주세요.
        </p>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">부서 연차 내역을 불러오는 중...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-gray-400">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <span className="text-sm">연차 내역을 불러오지 못했습니다.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-4 mt-4">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-50 px-4 py-3">
              <button
                onClick={() => {
                  setCurrentMonth((prev) => subMonths(prev, 1));
                  setSelectedDate((prev) =>
                    prev ? subMonths(prev, 1) : undefined,
                  );
                }}
                className="rounded-lg p-1 transition-colors hover:bg-gray-100 active:bg-gray-200"
                type="button"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              </button>
              <span className="text-base font-bold text-gray-900">
                {format(currentMonth, "yyyy년 M월", { locale: ko })}
              </span>
              <button
                onClick={() => {
                  setCurrentMonth((prev) => addMonths(prev, 1));
                  setSelectedDate((prev) =>
                    prev ? addMonths(prev, 1) : undefined,
                  );
                }}
                className="rounded-lg p-1 transition-colors hover:bg-gray-100 active:bg-gray-200"
                type="button"
              >
                <ChevronRight className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            <div className="grid grid-cols-7 px-2 py-1">
              {WEEKDAY_LABELS.map((label, idx) => (
                <div
                  key={label}
                  className={cn(
                    "py-2 text-center text-xs font-semibold",
                    idx === 0 && "text-red-400",
                    idx === 6 && "text-blue-400",
                    idx > 0 && idx < 6 && "text-gray-400",
                  )}
                >
                  {label}
                </div>
              ))}
              {Array.from({ length: startPadding }).map((_, idx) => (
                <div key={`pad-${idx}`} />
              ))}
              {days.map((day) => {
                const dayKey = toDateKey(day);
                const isSelected = selectedDate
                  ? isSameDay(day, selectedDate)
                  : false;
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const dayOfWeek = getDay(day);
                const hasLeave = (leaveDayMap[dayKey]?.length ?? 0) > 0;
                const hasCompanyHoliday = companyHolidaySet.has(dayKey);
                const isSunday = dayOfWeek === 0;
                const isSaturday = dayOfWeek === 6;
                const dayItems = leaveDayMap[dayKey] ?? [];
                const tooltip = dayItems
                  .map((item) => {
                    const deptLabel = item.dpt_name?.trim();
                    return `${item.emp_name}${deptLabel ? ` (${deptLabel})` : ""} · ${formatPeriod(item.year_bdate, item.year_edate)}`;
                  })
                  .join("\n");

                return (
                  <div
                    key={dayKey}
                    className={cn(
                      "mx-0.5 my-0.5 flex flex-col items-center justify-center rounded-xl py-1",
                      !isCurrentMonth && "opacity-30",
                      hasLeave && "cursor-pointer",
                      !hasLeave && "cursor-default",
                      isToday && "bg-[rgb(204,255,204)]",
                      isSelected && !isToday && "bg-white",
                    )}
                    title={tooltip || undefined}
                    onClick={() =>
                      hasLeave
                        ? setSelectedDate((prev) =>
                            prev && isSameDay(prev, day) ? undefined : day,
                          )
                        : undefined
                    }
                  >
                    <span
                      className={cn(
                        "text-sm leading-none",
                        !isSelected && (isSunday || hasCompanyHoliday) && "text-red-400",
                        !isSelected && !isSunday && isSaturday && "text-blue-400",
                        !isSelected &&
                          !isSunday &&
                          !hasCompanyHoliday &&
                          !isSaturday &&
                          "text-gray-700",
                        isToday && !isSelected && "font-bold text-primary",
                        isSelected && !hasCompanyHoliday && "font-bold text-gray-900",
                        isSelected && hasCompanyHoliday && "font-bold text-red-500",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="mt-0.5 flex min-h-2 items-center justify-center gap-0.5">
                      {hasLeave ? (
                        <span
                          className="h-1 w-1 shrink-0 rounded-full bg-indigo-400"
                          title="부서 연차"
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {isFetching && (
              <div className="mb-3 flex items-center justify-center gap-1 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                데이터를 갱신하고 있습니다.
              </div>
            )}
          </div>
        </div>

        <div className="mx-4 mb-4 mt-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              {selectedDate
                ? format(selectedDate, "M월 d일 연차/휴가", { locale: ko })
                : format(currentMonth, "M월 연차/휴가", { locale: ko })}
            </span>
            {selectedDateEvents.length > 0 && (
              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs font-medium text-white">
                {selectedDateEvents.length}건
              </span>
            )}
          </div>

          {selectedDateEvents.length > 0 ? (
            <div className="flex flex-col gap-2">
              {selectedDateEvents.map((event) => (
                <div
                  key={`${event.dateStr}-${event.empName}-${event.title}`}
                  className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 shadow-sm"
                >
                  <div className="h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" />
                  <div className="min-w-0">
                    <span className="text-xs text-indigo-500">
                      {event.dateRangeLabel}
                    </span>
                    <p className="break-words text-sm font-medium text-indigo-900">
                      {event.empName}
                      {event.dptName ? ` (${event.dptName})` : ""} · {event.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-6 shadow-sm">
              <CalendarDays className="h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400">
                {selectedDate
                  ? "선택한 날짜의 연차/휴가가 없습니다"
                  : "이번 달 연차/휴가가 없습니다"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
