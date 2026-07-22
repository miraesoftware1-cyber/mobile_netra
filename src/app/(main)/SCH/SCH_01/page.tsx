"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, addMonths, subMonths, getDay,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, CalendarPlus,
  Search, Plus, Pencil, Trash2, Save,
} from "lucide-react";
import { DataGrid } from "@/components/data-grid";
import type { GridColumn } from "@/components/data-grid";
import { useCrudGrid, DeleteConfirmDialog } from "@/components/crud-grid";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useMenuTitle } from "@/features/menu/use-menu-store";
import type { PagePerm } from "@/features/menu-permission/hooks/use-page-permission";
import type { CalScdRow } from "@/app/api/schedule-crud/route";
import { cn } from "@/lib/utils";

const FULL_PERM: PagePerm = { view: true, add: true, edit: true, del: true };
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

/* ──────────── 날짜 유틸 ──────────── */
function toYMD(d: Date) { return format(d, "yyyyMMdd"); }
function ymdDisplay(s: string) {
  if (s.length < 8) return s;
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}
function ymdToDate(s: string) {
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}

/* ──────────── 날짜 피커 (바텀시트) ──────────── */
interface DatePickerProps {
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}
function DatePicker({ value, onSelect, onClose }: DatePickerProps) {
  const init = value.length === 8 ? startOfMonth(ymdToDate(value)) : startOfMonth(new Date());
  const [viewMonth, setViewMonth] = useState(init);

  const monthStart = startOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(viewMonth) });
  const pad = getDay(monthStart);
  const selected = value.length === 8 ? ymdToDate(value) : null;
  const today = new Date();

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl shadow-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* 월 네비게이션 */}
        <div className="flex items-center justify-between px-6 py-3">
          <button onClick={() => setViewMonth((p) => subMonths(p, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-bold text-gray-900 text-base">
            {format(viewMonth, "yyyy년 M월", { locale: ko })}
          </span>
          <button onClick={() => setViewMonth((p) => addMonths(p, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 px-4">
          {WEEKDAY.map((label, i) => (
            <div key={label} className={cn(
              "text-center text-xs font-semibold py-2",
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400",
            )}>
              {label}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 px-4 pb-6">
          {Array.from({ length: pad }).map((_, i) => <div key={`p${i}`} />)}
          {days.map((day) => {
            const dow = getDay(day);
            const isSel = selected ? isSameDay(day, selected) : false;
            const isToday = isSameDay(day, today);
            return (
              <button
                key={format(day, "yyyyMMdd")}
                onClick={() => { onSelect(toYMD(day)); onClose(); }}
                className={cn(
                  "flex items-center justify-center h-9 rounded-xl text-sm transition-colors",
                  isSel && "bg-primary text-white font-bold",
                  !isSel && isToday && "bg-primary/10 text-primary font-bold",
                  !isSel && !isToday && dow === 0 && "text-red-400",
                  !isSel && !isToday && dow === 6 && "text-blue-400",
                  !isSel && !isToday && dow > 0 && dow < 6 && "text-gray-700",
                  !isSel && "hover:bg-gray-100",
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ──────────── 컬럼 정의 ──────────── */
// 숫자만 추출 후 자동으로 HH:MM 형식 삽입
function transformTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

const COLUMNS: GridColumn<CalScdRow>[] = [
  { dataField: "scd_name",   caption: "일정명",   cellType: "text", required: true, widthClass: "w-40" },
  { dataField: "beg_date",   caption: "시작일",   cellType: "date", required: true, widthClass: "w-32" },
  { dataField: "end_date",   caption: "종료일",   cellType: "date", required: true, widthClass: "w-32" },
  { dataField: "scd_time",   caption: "시작시간", cellType: "time", widthClass: "w-28", align: "center" },
  { dataField: "scd_remark", caption: "비고",     cellType: "text", widthClass: "w-48" },
];

/* ──────────── 페이지 ──────────── */
export default function ScheduleRegisterPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const pageTitle = useMenuTitle("SCH_01", "일정관리 등록");

  const now = new Date();
  const [startDate, setStartDate] = useState(() => toYMD(startOfMonth(now)));
  const [endDate,   setEndDate]   = useState(() => toYMD(endOfMonth(now)));
  const [picker, setPicker]       = useState<"start" | "end" | null>(null);

  const c = useCrudGrid<CalScdRow, Record<string, never>>({
    keyField: "scd_key",
    emptyRow: {
      emp_code: user?.emp_code ?? "", scd_month: "", scd_no1: "", scd_key: "",
      scd_name: "", beg_date: toYMD(now), end_date: toYMD(now), scd_time: "", scd_remark: "",
    },
    columns: COLUMNS,
    perm: FULL_PERM,
    initialFilters: {},
    insertPosition: "end",
    listItems: async () => {
      if (!user?.companyCode || !user?.emp_code) return [];
      const params = new URLSearchParams({
        companyCode: user.companyCode,
        empCode: user.emp_code,
        startDate,
        endDate,
      });
      const res = await fetch(`/api/schedule-crud?${params.toString()}`);
      if (!res.ok) return [];
      const data: { items: CalScdRow[] } = await res.json();
      return data.items ?? [];
    },
    createItem: async (row) => {
      const res = await fetch("/api/schedule-crud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: user?.companyCode,
          emp_code:    user?.emp_code,
          user_id:     user?.user_id,
          scd_name:    row.scd_name,
          beg_date:    row.beg_date,
          end_date:    row.end_date,
          scd_time:    row.scd_time,
          scd_remark:  row.scd_remark,
        }),
      });
      return res.json();
    },
    updateItem: async (_key, row) => {
      const res = await fetch("/api/schedule-crud", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: user?.companyCode,
          emp_code:    row.emp_code,
          scd_month:   row.scd_month,
          scd_no1:     row.scd_no1,
          user_id:     user?.user_id,
          scd_name:    row.scd_name,
          beg_date:    row.beg_date,
          end_date:    row.end_date,
          scd_time:    row.scd_time,
          scd_remark:  row.scd_remark,
        }),
      });
      return res.json();
    },
    deleteItem: async () => {
      const row = c.focusedRow;
      const res = await fetch("/api/schedule-crud", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: user?.companyCode,
          emp_code:    row?.emp_code ?? user?.emp_code,
          scd_month:   row?.scd_month,
          scd_no1:     row?.scd_no1,
        }),
      });
      return res.json();
    },
  });

  const canSave  = c.grid.isDirty && !c.saving;
  const canEdit  = !!c.focusedRow && !c.hasInsertRow;
  const canDel   = !!c.focusedRow;

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">

      {/* ── 헤더 ── */}
      <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <CalendarPlus className="w-5 h-5 text-primary" />
          <h1 className="text-base font-bold text-gray-900">{pageTitle}</h1>
        </div>
      </header>

      {/* ── 조회조건 카드 ── */}
      <div className="shrink-0 px-4 pt-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-xs font-medium text-gray-400 mb-2">조회기간</p>
          <div className="flex items-center gap-2">
            {/* 시작일 버튼 */}
            <button
              onClick={() => setPicker("start")}
              className="flex-1 text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-center"
            >
              {ymdDisplay(startDate)}
            </button>
            <span className="text-gray-400 text-sm shrink-0">~</span>
            {/* 종료일 버튼 */}
            <button
              onClick={() => setPicker("end")}
              className="flex-1 text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-center"
            >
              {ymdDisplay(endDate)}
            </button>
            {/* 조회 버튼 */}
            <button
              onClick={c.handleQuery}
              className="shrink-0 flex items-center gap-1 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              <Search className="w-3.5 h-3.5" />
              조회
            </button>
          </div>
        </div>
      </div>

      {/* ── 액션 버튼 행 ── */}
      <div className="shrink-0 px-4 pt-2 flex items-center gap-1.5">
        <button
          onClick={c.handleAddRow}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100"
        >
          <Plus className="w-3.5 h-3.5" />
          추가
        </button>
        <button
          onClick={c.handleEditSelected}
          disabled={!canEdit}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40"
        >
          <Pencil className="w-3.5 h-3.5" />
          수정
        </button>
        <button
          onClick={c.handleDeleteFocused}
          disabled={!canDel}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-100 text-red-500 hover:bg-red-50 active:bg-red-100 disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          삭제
        </button>
        {/* 저장은 오른쪽 끝 */}
        <div className="flex-1" />
        <button
          onClick={c.handleSaveAll}
          disabled={!canSave}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" />
          {c.saving
            ? "저장 중"
            : c.grid.changedRows.length > 0
              ? `저장 (${c.grid.changedRows.length})`
              : "저장"}
        </button>
      </div>

      {/* ── 그리드 ── */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-2">
        <div className="h-full rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-white">
          <DataGrid
            ref={c.gridRef}
            columns={c.columns}
            rows={c.filteredRows}
            focusedKey={c.grid.focusedKey}
            onFocusedRowChanged={c.grid.setFocusedKey}
            onCellChange={(key, field, value) => c.grid.updateCell(key, field, value)}
            onCancelNewRow={(key) => c.grid.deleteRow(key)}
            onRevertRow={(key, snapshot) => c.grid.revertRow(key, snapshot)}
            onRequestSave={c.handleSaveAll}
            onRequestInsertRow={c.handleAddRow}
            onRequestDeleteRow={c.handleDeleteFocused}
            searchFormRef={c.searchFormRef}
            loading={c.loading}
            emptyMessage="등록된 일정이 없습니다"
          />
        </div>
      </div>

      {/* ── 삭제 확인 다이얼로그 ── */}
      <DeleteConfirmDialog
        open={c.deleteConfirmOpen}
        onOpenChange={c.setDeleteConfirmOpen}
        label={c.focusedRow?.scd_name ?? ""}
        onConfirm={c.executeDelete}
      />

      {/* ── 날짜 피커 바텀시트 ── */}
      {picker && (
        <DatePicker
          value={picker === "start" ? startDate : endDate}
          onSelect={(v) => picker === "start" ? setStartDate(v) : setEndDate(v)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
