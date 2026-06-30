"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, getYear } from "date-fns";
import { ko } from "date-fns/locale";
import { match } from "ts-pattern";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { fetchHolidayList } from "@/features/leave/api";
import { cn } from "@/lib/utils";

const GRID_COLS =
  "grid grid-cols-[minmax(4.75rem,1fr)_minmax(4.75rem,1fr)_minmax(3.25rem,auto)_minmax(2rem,auto)_minmax(3.25rem,auto)] gap-x-2";

function formatApiDate(dateStr: string) {
  if (!dateStr || dateStr.length < 8) return dateStr;
  const normalized = dateStr.replace(/-/g, "");
  const date = new Date(
    Number(normalized.slice(0, 4)),
    Number(normalized.slice(4, 6)) - 1,
    Number(normalized.slice(6, 8)),
  );
  return format(date, "yy.MM.dd", { locale: ko });
}

/** API에 시작일(YYYYMMDD 또는 하이픈 포함 8자리 이상 숫자 일자)이 없으면 일·상태를 표시하지 않음 */
function hasApiStartDate(yearBdate: string | undefined | null) {
  if (yearBdate == null) return false;
  const normalized = String(yearBdate).trim().replace(/-/g, "");
  return normalized.length >= 8;
}

function statusBadgeVariant(status: string) {
  return match(status.trim())
    .with("승인", () => "default" as const)
    .with("신청", () => "secondary" as const)
    .with("대기", () => "secondary" as const)
    .with("반려", () => "destructive" as const)
    .otherwise(() => "outline" as const);
}

function buildYearOptions(anchorYear: number) {
  const minY = anchorYear - 20;
  const maxY = anchorYear + 2;
  const years: number[] = [];
  for (let y = maxY; y >= minY; y -= 1) {
    years.push(y);
  }
  return years;
}

function formatBalanceValue(value: number | null) {
  if (value === null) return "—";
  if (Number.isInteger(value)) return `${value}`;
  return String(value);
}

export function LeaveInquiryView() {
  const user = useAuthStore((s) => s.user);
  const empName = user?.emp_name?.trim();
  const corpName = user?.corp_name?.trim();
  const dptName = user?.dpt_name?.trim();
  const fullUserDisplay = [corpName, dptName, empName]
    .filter(Boolean)
    .join(" · ");
  const anchorYear = getYear(new Date());
  const [baseYear, setBaseYear] = useState(() => anchorYear);

  const yearOptions = useMemo(() => buildYearOptions(anchorYear), [anchorYear]);

  const canQuery = !!user?.companyCode && !!user?.corp_code && !!user?.emp_code;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [
      "leave-holiday-list",
      user?.companyCode,
      user?.corp_code,
      user?.emp_code,
      baseYear,
    ],
    queryFn: async () => {
      if (!user?.companyCode || !user.corp_code || !user.emp_code) {
        throw new Error("로그인 정보가 필요합니다.");
      }
      const result = await fetchHolidayList(
        user.companyCode,
        user.corp_code,
        String(baseYear),
        user.emp_code,
      );
      if (result.success === false) {
        throw new Error(result.error);
      }
      return {
        items: result.items,
        emptyMessage: result.emptyMessage,
      };
    },
    enabled: canQuery,
  });

  const items = data?.items ?? [];
  const firstRow = items[0];
  const accruedDisplay = firstRow
    ? `${formatBalanceValue(firstRow.year_alday)}일`
    : "—";
  const remainingDisplay = firstRow
    ? `${formatBalanceValue(firstRow.year_reday)}일`
    : "—";
  const usedDisplay = firstRow
    ? (() => {
        const alday = firstRow.year_alday;
        const reday = firstRow.year_reday;
        if (alday === null || reday === null) return "—";

        const usedValue = Number(alday) - Number(reday);
        if (!Number.isFinite(usedValue)) return "—";
        return `${formatBalanceValue(usedValue)}일`;
      })()
    : "—";

  const emptyListMessage = data?.emptyMessage ?? "연차 내역이 없습니다.";

  if (!canQuery) {
    return (
      <div className="flex flex-col flex-1 min-h-0 w-full items-center justify-center gap-3 py-16 px-6 text-center">
        <AlertCircle className="w-8 h-8 text-orange-400" />
        <p className="text-sm text-gray-600">
          연차 내역을 불러오려면 회사·사번 정보가 필요합니다. 다시 로그인해
          주세요.
        </p>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex flex-col flex-1 min-h-0 w-full items-center justify-center gap-3 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">연차 내역을 불러오는 중...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col flex-1 min-h-0 w-full items-center justify-center gap-3 text-gray-400 px-6">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <span className="text-sm text-center">
          연차 내역을 불러오지 못했습니다.
        </span>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full gap-4 px-4 pt-4 pb-4">
      <Card className="flex-shrink-0 border-gray-100 shadow-sm">
        <CardContent className="p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <dd className="col-span-2 text-left">
              <span className="text-sm font-semibold text-gray-900 truncate whitespace-nowrap inline-block max-w-full">
                {fullUserDisplay ? fullUserDisplay : "—"}
              </span>
            </dd>
          </dl>

          <div className="mt-3 grid grid-cols-3 gap-x-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">발생연차</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {isFetching ? "…" : accruedDisplay}
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">사용연차</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {isFetching ? "…" : usedDisplay}
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">미사용연차</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {isFetching ? "…" : remainingDisplay}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-shrink-0 items-center justify-between px-0.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-gray-700 whitespace-nowrap">
              연차 내역
            </h2>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 whitespace-nowrap">
                (기준연도 :
              </span>
              <Select
                value={String(baseYear)}
                onValueChange={(v) => setBaseYear(Number(v))}
                disabled={isFetching}
              >
                <SelectTrigger
                  className="h-11 w-[6.75rem] border-gray-200 font-normal shadow-none"
                  aria-label="기준연도 선택"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}년
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-400 whitespace-nowrap">)</span>
            </div>
          </div>
          {isFetching && !isLoading && (
            <Loader2
              className="w-4 h-4 animate-spin text-gray-400 shrink-0"
              aria-hidden
            />
          )}
        </div>
        <Card className="flex flex-1 min-h-0 flex-col border-gray-100 shadow-sm overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-y-contain">
            <div className="min-w-[20rem]">
              <div
                className={cn(
                  GRID_COLS,
                  "sticky top-0 z-10 border-b border-gray-100 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700",
                )}
              >
                <span>시작일</span>
                <span>종료일</span>
                <span>구분</span>
                <span className="text-center">일</span>
                <span className="text-center">상태</span>
              </div>
              {items.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-gray-500">
                  {emptyListMessage}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {items.map((row, index) => {
                    const showDaysAndStatus = hasApiStartDate(row.year_bdate);
                    return (
                      <div
                        key={`${row.year_bdate}-${row.year_edate}-${row.holiday_typ}-${index}`}
                        className={cn(
                          GRID_COLS,
                          "px-3 py-3 text-sm text-gray-900 items-center",
                        )}
                      >
                        <span className="tabular-nums">
                          {formatApiDate(row.year_bdate)}
                        </span>
                        <span className="tabular-nums">
                          {formatApiDate(row.year_edate)}
                        </span>
                        <span
                          className="text-gray-700 truncate"
                          title={row.holiday_typ}
                        >
                          {row.holiday_typ}
                        </span>
                        <span className="text-center tabular-nums font-medium">
                          {showDaysAndStatus
                            ? formatBalanceValue(row.year_emday)
                            : ""}
                        </span>
                        <span className="flex justify-center">
                          {showDaysAndStatus ? (
                            <Badge
                              variant={statusBadgeVariant(row.app_status)}
                              className="px-2 py-0 text-sm font-semibold"
                            >
                              {row.app_status}
                            </Badge>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
