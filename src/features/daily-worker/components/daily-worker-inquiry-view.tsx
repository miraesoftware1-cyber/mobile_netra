"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
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
  fetchDailyWorkerCorps,
  fetchDailyWorkerList,
  type DailyWorkerListItem,
} from "@/features/daily-worker/api";
import { cn } from "@/lib/utils";

const GRID_COLS =
  "grid grid-cols-[minmax(4rem,0.8fr)_minmax(4rem,0.8fr)_minmax(6rem,1.1fr)_minmax(3rem,0.6fr)_minmax(7rem,1.2fr)] gap-x-2";

function maskIdno(idno: string) {
  if (!idno || idno.length < 7) return idno || "—";
  return `${idno.slice(0, 6)}-${"*".repeat(7)}`;
}

function formatGender(gender: string) {
  if (gender === "W") return "여";
  if (gender === "M") return "남";
  return gender || "—";
}

type SearchParams = {
  corpCode: string;
  etcName: string;
  searchId: number;
};

export function DailyWorkerInquiryView() {
  const user = useAuthStore((s) => s.user);
  const companyCode = user?.companyCode?.trim() ?? "";

  const [selectedCorpCode, setSelectedCorpCode] = useState("__all__");
  const [nameInput, setNameInput] = useState("");
  const [submittedParams, setSubmittedParams] = useState<SearchParams | null>(null);

  const corpsQuery = useQuery({
    queryKey: ["daily-worker-corps", companyCode],
    queryFn: async () => {
      const result = await fetchDailyWorkerCorps(companyCode);
      if (result.success) return result.data;
      throw new Error((result as { error: string }).error);
    },
    enabled: Boolean(companyCode),
    staleTime: 1000 * 60 * 5,
  });

  const listQuery = useQuery({
    queryKey: [
      "daily-worker-list",
      companyCode,
      submittedParams?.corpCode,
      submittedParams?.searchId,
    ],
    queryFn: async () => {
      if (!submittedParams) return [];
      const result = await fetchDailyWorkerList(
        companyCode,
        submittedParams.corpCode,
        "",
      );
      if (result.success) return result.data;
      throw new Error((result as { error: string }).error);
    },
    enabled: Boolean(companyCode && submittedParams),
    retry: false,
  });

  function handleSearch() {
    setSubmittedParams((prev) => ({
      corpCode: selectedCorpCode === "__all__" ? "" : selectedCorpCode,
      etcName: nameInput.trim(),
      searchId: (prev?.searchId ?? 0) + 1,
    }));
  }

  const allRows: DailyWorkerListItem[] = listQuery.data ?? [];
  const rows: DailyWorkerListItem[] =
    submittedParams?.etcName
      ? allRows.filter((r) =>
          r.etc_name?.includes(submittedParams.etcName),
        )
      : allRows;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 pb-4 pt-4">
      <Card className="flex-shrink-0 border-gray-100 shadow-sm">
        <CardContent className="p-3">
          <div className="flex gap-2 items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">업체명</label>
              {corpsQuery.isPending ? (
                <div className="h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 flex items-center text-sm text-gray-400">
                  불러오는 중...
                </div>
              ) : corpsQuery.isError ? (
                <div className="h-10 rounded-lg border border-red-200 bg-red-50 px-3 flex items-center text-xs text-red-500">
                  불러올 수 없습니다.
                </div>
              ) : (
                <Select value={selectedCorpCode} onValueChange={setSelectedCorpCode}>
                  <SelectTrigger
                    className="h-10 border-gray-200 font-normal shadow-none"
                    aria-label="업체명 선택"
                  >
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {(corpsQuery.data ?? []).map((item) => (
                      <SelectItem key={item.c_code} value={item.c_code}>
                        {item.c_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">성명</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="성명 입력"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>

            <button
              type="button"
              onClick={handleSearch}
              disabled={!companyCode}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors active:opacity-80 disabled:opacity-40 flex-shrink-0"
            >
              <Search className="h-4 w-4" />
              조회
            </button>
          </div>
        </CardContent>
      </Card>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <h2 className="flex-shrink-0 px-0.5 text-sm font-semibold text-gray-700">
          일용직 인사정보 목록
          {rows.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              ({rows.length}명)
            </span>
          )}
        </h2>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-gray-100 shadow-sm">
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain">
            <div className="min-w-[28rem]">
              <div
                className={cn(
                  GRID_COLS,
                  "sticky top-0 z-10 w-full border-b border-gray-100 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700",
                )}
              >
                <span>성명</span>
                <span>업체</span>
                <span>연락처</span>
                <span>성별</span>
                <span>주민번호</span>
              </div>

              {!companyCode ? (
                <div className="px-3 py-10 text-center text-sm text-gray-500">
                  로그인 정보를 확인할 수 없습니다.
                </div>
              ) : !submittedParams ? (
                <div className="px-3 py-10 text-center text-sm text-gray-400">
                  조회 조건을 입력하고 조회 버튼을 누르세요.
                </div>
              ) : listQuery.isPending ? (
                <div className="px-3 py-10 text-center text-sm text-gray-500">
                  조회 중입니다...
                </div>
              ) : listQuery.isError ? (
                <div className="px-3 py-10 text-center text-sm text-red-600">
                  {listQuery.error instanceof Error
                    ? listQuery.error.message
                    : "일용직 인사정보를 불러오지 못했습니다."}
                </div>
              ) : rows.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-gray-500">
                  조회된 인사정보가 없습니다.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {rows.map((row, index) => (
                    <div
                      key={`${row.etc_code}-${index}`}
                      className={cn(
                        GRID_COLS,
                        "items-center px-3 py-3 text-sm text-gray-900",
                      )}
                    >
                      <span className="font-medium">{row.etc_name || "—"}</span>
                      <span className="truncate text-gray-700" title={row.att_corp_code}>
                        {row.att_corp_code || "—"}
                      </span>
                      <span className="tabular-nums text-gray-700">
                        {row.cel_no || "—"}
                      </span>
                      <span className="text-gray-700">
                        {formatGender(row.gender)}
                      </span>
                      <span className="tabular-nums text-gray-700">
                        {maskIdno(row.etc_idno)}
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
