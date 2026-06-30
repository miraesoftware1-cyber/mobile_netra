"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import { match } from "ts-pattern";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import {
  fetchExpenseInquiryList,
  type ExpenseInquiryApiItem,
} from "@/features/expense/api";
import { cn } from "@/lib/utils";

type ExpenseStatus = "승인" | "요청" | "반려";

type ExpenseRow = {
  expenseDate: string;
  merchantName: string;
  category: string;
  amount: number;
  status: ExpenseStatus;
};

const GRID_COLS =
  "grid grid-cols-[minmax(5rem,1fr)_minmax(5rem,1fr)_minmax(4.5rem,0.85fr)_minmax(3.5rem,auto)_minmax(6rem,1.1fr)] gap-x-2";

function statusBadgeVariant(status: ExpenseStatus) {
  return match(status)
    .with("승인", () => "default" as const)
    .with("요청", () => "secondary" as const)
    .with("반려", () => "destructive" as const)
    .exhaustive();
}

function buildYearMonthOptions() {
  return Array.from({ length: 12 }, (_, index) => {
    const monthDate = subMonths(new Date(), index);
    const value = format(monthDate, "yyyy-MM");
    const label = format(monthDate, "yyyy년 M월", { locale: ko });
    return { value, label };
  });
}

function formatKrw(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function schDateToIsoDate(schDate: string) {
  if (/^\d{8}$/.test(schDate)) {
    const y = schDate.slice(0, 4);
    const m = schDate.slice(4, 6);
    const d = schDate.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return schDate;
}

function mapSlipTypeToStatus(slipType: string): ExpenseStatus {
  const normalized = slipType.trim();
  return match(normalized)
    .with("승인", () => "승인" as const)
    .with("요청", () => "요청" as const)
    .with("반려", () => "반려" as const)
    .otherwise(() => "요청" as const);
}

function mapInquiryItemsToRows(items: ExpenseInquiryApiItem[]): ExpenseRow[] {
  return items.map((item) => ({
    expenseDate: schDateToIsoDate(item.sch_date),
    merchantName: item.cst_name?.trim() || "—",
    category: item.bslip_name?.trim() || "—",
    amount: Number(item.bslip_sum) || 0,
    status: mapSlipTypeToStatus(item.slip_type ?? ""),
  }));
}

export function ExpenseInquiryView() {
  const user = useAuthStore((s) => s.user);
  const companyCode = user?.companyCode?.trim() ?? "";
  const empCode = user?.emp_code?.trim() ?? "";
  const corpName = user?.corp_name?.trim();
  const dptName = user?.dpt_name?.trim();
  const empName = user?.emp_name?.trim();
  const fullUserDisplay = [corpName, dptName, empName]
    .filter(Boolean)
    .join(" · ");

  const ymOptions = useMemo(buildYearMonthOptions, []);
  const [baseYearMonth, setBaseYearMonth] = useState(
    () => ymOptions[0]?.value ?? "",
  );
  const yearMonthYyyymm = useMemo(
    () => baseYearMonth.replace(/-/g, ""),
    [baseYearMonth],
  );

  const listQuery = useQuery({
    queryKey: ["expense-inquiry-list", companyCode, empCode, yearMonthYyyymm],
    retry: false,
    queryFn: async () => {
      const result = await fetchExpenseInquiryList(
        companyCode,
        empCode,
        yearMonthYyyymm,
      );
      if (result.success === false) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: Boolean(companyCode && empCode && /^\d{6}$/.test(yearMonthYyyymm)),
  });

  const rows = useMemo(
    () => mapInquiryItemsToRows(listQuery.data ?? []),
    [listQuery.data],
  );

  const amountSummary = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const approved = rows
      .filter((row) => row.status === "승인")
      .reduce((sum, row) => sum + row.amount, 0);
    const requested = rows
      .filter((row) => row.status === "요청")
      .reduce((sum, row) => sum + row.amount, 0);
    return { total, approved, requested };
  }, [rows]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 pb-4 pt-4">
      <Card className="flex-shrink-0 border-gray-100 shadow-sm">
        <CardContent className="p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <dd className="col-span-2 text-left">
              <span className="inline-block max-w-full truncate whitespace-nowrap text-sm font-semibold text-gray-900">
                {fullUserDisplay || "—"}
              </span>
            </dd>
          </dl>

          <div className="mt-3 grid grid-cols-3 gap-x-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">총 지출금액</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {formatKrw(amountSummary.total)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">승인금액</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {formatKrw(amountSummary.approved)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">요청금액</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {formatKrw(amountSummary.requested)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex flex-shrink-0 items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="whitespace-nowrap text-sm font-semibold text-gray-700">
              지출결의 내역
            </h2>
            <div className="flex items-center gap-1">
              <span className="whitespace-nowrap text-xs text-gray-400">
                (기준연월 :
              </span>
              <Select value={baseYearMonth} onValueChange={setBaseYearMonth}>
                <SelectTrigger
                  className="h-11 w-[8rem] border-gray-200 font-normal shadow-none"
                  aria-label="기준연월 선택"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ymOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="whitespace-nowrap text-xs text-gray-400">)</span>
            </div>
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-gray-100 shadow-sm">
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain">
            <div className="min-w-[24rem]">
              <div
                className={cn(
                  GRID_COLS,
                  "sticky top-0 z-10 w-full border-b border-gray-100 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700",
                )}
              >
                <span>지출일</span>
                <span>항목</span>
                <span className="text-right">금액</span>
                <span className="text-center">상태</span>
                <span>상호명</span>
              </div>
              {!companyCode || !empCode ? (
                <div className="px-3 py-10 text-center text-sm text-gray-500">
                  로그인 정보(회사·사번)를 확인할 수 없어 내역을 불러올 수
                  없습니다.
                </div>
              ) : listQuery.isPending ? (
                <div className="px-3 py-10 text-center text-sm text-gray-500">
                  지출결의 내역을 불러오는 중입니다.
                </div>
              ) : listQuery.isError ? (
                <div className="px-3 py-10 text-center text-sm text-red-600">
                  {listQuery.error instanceof Error
                    ? listQuery.error.message
                    : "지출결의 내역을 불러오지 못했습니다."}
                </div>
              ) : rows.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-gray-500">
                  해당 기준연월의 지출결의 내역이 없습니다.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {rows.map((row, index) => (
                    <div
                      key={`${row.expenseDate}-${row.merchantName}-${index}`}
                      className={cn(
                        GRID_COLS,
                        "items-center px-3 py-3 text-sm text-gray-900",
                      )}
                    >
                      <span className="tabular-nums">
                        {format(
                          new Date(`${row.expenseDate}T12:00:00`),
                          "yy.MM.dd",
                        )}
                      </span>
                      <span
                        className="truncate text-gray-700"
                        title={row.category}
                      >
                        {row.category}
                      </span>
                      <span className="text-right tabular-nums font-medium">
                        {formatKrw(row.amount)}
                      </span>
                      <span className="flex justify-center">
                        <Badge
                          variant={statusBadgeVariant(row.status)}
                          className="px-2 py-0 text-sm font-semibold"
                        >
                          {row.status}
                        </Badge>
                      </span>
                      <span className="truncate" title={row.merchantName}>
                        {row.merchantName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
