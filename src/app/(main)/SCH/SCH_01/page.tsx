"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  ChevronLeft, CalendarPlus,
  Search, Plus, Pencil, Trash2, X, AlertCircle,
} from "lucide-react";
import { DataGrid } from "@/components/data-grid";
import type { GridColumn, GridRow } from "@/components/data-grid";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useMenuTitle } from "@/features/menu/use-menu-store";
import { usePagePermission } from "@/features/menu-permission/hooks/use-page-permission";
import type { CalScdRow } from "@/app/api/schedule-crud/route";

/* ──────────── 날짜 유틸 ──────────── */
function toYMD(d: Date) { return format(d, "yyyyMMdd"); }
function ymdToInput(s: string) {
  if (!s || s.length < 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}
function formatYMD(s: string) {
  const d = String(s ?? "").replace(/-/g, "");
  if (d.length !== 8) return String(s ?? "");
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}
function toGridRow(r: CalScdRow): GridRow<CalScdRow> {
  return { ...r, __key: r.scd_key, __status: "unchanged" };
}

/* ──────────── 컬럼 정의 (읽기 전용) ──────────── */
const COLUMNS: GridColumn<CalScdRow>[] = [
  {
    dataField: "scd_name", caption: "일정명", widthClass: "w-40", fixedWidth: true,
    render: (v) => <span className="block truncate">{String(v ?? "")}</span>,
  },
  {
    dataField: "beg_date", caption: "시작일", widthClass: "w-28", align: "center",
    render: (v) => <span>{formatYMD(String(v ?? ""))}</span>,
  },
  {
    dataField: "end_date", caption: "종료일", widthClass: "w-28", align: "center",
    render: (v) => <span>{formatYMD(String(v ?? ""))}</span>,
  },
  {
    dataField: "scd_time", caption: "시작시간", widthClass: "w-24", align: "center",
  },
  {
    dataField: "scd_remark", caption: "비고", widthClass: "w-44", fixedWidth: true,
    render: (v) => <span className="block truncate">{String(v ?? "")}</span>,
  },
];

/* ──────────── 폼 상태 ──────────── */
type FormState = {
  scd_name: string;
  beg_date: string;
  end_date: string;
  scd_time: string;
  scd_remark: string;
};

function emptyForm(today: string): FormState {
  return { scd_name: "", beg_date: today, end_date: today, scd_time: "", scd_remark: "" };
}

/* ──────────── 페이지 ──────────── */
export default function ScheduleRegisterPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const pageTitle = useMenuTitle("SCH_01", "일정관리 등록");
  const perm = usePagePermission("SCH_01");

  const now = new Date();
  const todayYMD = toYMD(now);
  const [startDate, setStartDate] = useState(() => toYMD(startOfMonth(now)));
  const [endDate, setEndDate] = useState(() => toYMD(endOfMonth(now)));

  const [rows, setRows] = useState<CalScdRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  /* 체크박스 선택 */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  /* 모달 */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CalScdRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(todayYMD));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* 삭제 확인 */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const gridRows = rows.map(toGridRow);
  const focusedRow = rows.find((r) => r.scd_key === focusedKey) ?? null;
  const allSelected = gridRows.length > 0 && gridRows.every((r) => selectedKeys.has(r.__key));
  const someSelected = selectedKeys.size > 0;

  /* ── 조회 ── */
  async function loadRows() {
    if (!user?.companyCode || !user?.emp_code) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        companyCode: user.companyCode,
        empCode: user.emp_code,
        startDate,
        endDate,
      });
      const res = await fetch(`/api/schedule-crud?${params.toString()}`);
      if (!res.ok) return;
      const data: { items: CalScdRow[] } = await res.json();
      const sorted = (data.items ?? []).sort((a, b) =>
        (a.beg_date ?? "").localeCompare(b.beg_date ?? "")
      );
      setRows(sorted);
      setSelectedKeys(new Set());
    } finally {
      setLoading(false);
    }
  }

  /* ── 모달 열기 ── */
  function openAdd() {
    setEditingRow(null);
    setForm(emptyForm(todayYMD));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit() {
    if (!focusedRow) return;
    setEditingRow(focusedRow);
    setForm({
      scd_name: focusedRow.scd_name ?? "",
      beg_date: focusedRow.beg_date ?? "",
      end_date: focusedRow.end_date ?? "",
      scd_time: focusedRow.scd_time ?? "",
      scd_remark: focusedRow.scd_remark ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setFormError(null);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  }

  /* ── 저장 ── */
  async function handleSave() {
    const { scd_name, beg_date, end_date, scd_time, scd_remark } = form;
    if (!scd_name.trim()) { setFormError("일정명을 입력해주세요."); return; }
    if ([...scd_name].length > 50) { setFormError("일정명은 50글자 이내로 작성해주세요."); return; }
    if (!beg_date) { setFormError("시작일을 입력해주세요."); return; }
    if (!end_date) { setFormError("종료일을 입력해주세요."); return; }
    if (beg_date > end_date) { setFormError("종료일이 시작일보다 빠릅니다."); return; }
    if ([...scd_remark].length > 250) { setFormError("비고는 250글자 이내로 작성해주세요."); return; }

    setSaving(true);
    try {
      let res: Response;
      if (editingRow) {
        res = await fetch("/api/schedule-crud", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyCode: user?.companyCode,
            emp_code: editingRow.emp_code,
            scd_month: editingRow.scd_month,
            scd_no1: editingRow.scd_no1,
            user_id: user?.user_id,
            scd_name: scd_name.trim(),
            beg_date, end_date, scd_time, scd_remark,
          }),
        });
      } else {
        res = await fetch("/api/schedule-crud", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyCode: user?.companyCode,
            emp_code: user?.emp_code,
            user_id: user?.user_id,
            scd_name: scd_name.trim(),
            beg_date, end_date, scd_time, scd_remark,
          }),
        });
      }
      const result = await res.json();
      if (!result.ok) throw new Error(result.message || "저장 실패");
      closeModal();
      await loadRows();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  /* ── 삭제 ── */
  async function handleDelete() {
    setDeleting(true);
    try {
      const toDelete = rows.filter((r) => selectedKeys.has(r.scd_key));
      for (const row of toDelete) {
        await fetch("/api/schedule-crud", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyCode: user?.companyCode,
            emp_code: row.emp_code,
            scd_month: row.scd_month,
            scd_no1: row.scd_no1,
          }),
        });
      }
      setDeleteConfirmOpen(false);
      setSelectedKeys(new Set());
      await loadRows();
    } finally {
      setDeleting(false);
    }
  }

  /* ── 체크박스 토글 ── */
  function toggleRow(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(gridRows.map((r) => r.__key)));
    }
  }

  /* ─────────────── 렌더 ─────────────── */
  return (
    <>
      <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">

        {/* ── 헤더 ── */}
        <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <CalendarPlus className="w-5 h-5 text-primary" />
            <h1 className="text-base font-bold text-gray-900">{pageTitle}</h1>
          </div>
        </header>

        {/* ── 조회조건 ── */}
        <div className="shrink-0 px-4 pt-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-xs font-medium text-gray-400 mb-2">조회기간</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={ymdToInput(startDate)}
                max={ymdToInput(endDate)}
                onChange={(e) => {
                  const v = e.target.value.replace(/-/g, "");
                  setStartDate(v);
                  if (v && endDate && v > endDate) setEndDate(v);
                }}
                className="flex-1 text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              />
              <span className="text-gray-400 text-sm shrink-0">~</span>
              <input
                type="date"
                value={ymdToInput(endDate)}
                min={ymdToInput(startDate)}
                onChange={(e) => {
                  const v = e.target.value.replace(/-/g, "");
                  if (v && startDate && v < startDate) return;
                  setEndDate(v);
                }}
                className="flex-1 text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* ── 액션 버튼 ── */}
        <div className="shrink-0 px-4 pt-2 flex items-center gap-1.5">
          <button
            onClick={openAdd}
            disabled={!perm.add}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            추가
          </button>
          <button
            onClick={openEdit}
            disabled={!perm.edit || !focusedRow}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40"
          >
            <Pencil className="w-3.5 h-3.5" />
            수정
          </button>
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={!perm.del || !someSelected}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-100 text-red-500 hover:bg-red-50 active:bg-red-100 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            삭제{someSelected ? ` (${selectedKeys.size})` : ""}
          </button>
          <div className="flex-1" />
          <button
            onClick={loadRows}
            disabled={!perm.view}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40"
          >
            <Search className="w-3.5 h-3.5" />
            조회
          </button>
        </div>

        {/* ── 그리드 ── */}
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-2">
          <div className="h-full rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-white">
            <DataGrid
              columns={COLUMNS}
              rows={gridRows}
              focusedKey={focusedKey}
              onFocusedRowChanged={setFocusedKey}
              onCellChange={() => {}}
              loading={loading}
              emptyMessage="등록된 일정이 없습니다"
              selection={{
                selectedKeys,
                onToggleRow: toggleRow,
                onToggleAll: toggleAll,
                allSelected,
                someSelected,
              }}
            />
          </div>
        </div>
      </div>

      {/* ──────────── 추가/수정 모달 ──────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* 배경 오버레이 */}
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />

          {/* 모달 */}
          <div className="relative bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">

            {/* 모달 헤더 */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editingRow ? "일정 수정" : "일정 추가"}
              </h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* 폼 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-5">

                {/* 일정명 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-700">
                      일정명 <span className="text-red-400">*</span>
                    </label>
                    <span className={`text-xs ${[...form.scd_name].length >= 50 ? "text-red-400 font-semibold" : "text-gray-400"}`}>
                      {[...form.scd_name].length}/50
                    </span>
                  </div>
                  <input
                    type="text"
                    value={form.scd_name}
                    placeholder="일정명을 입력해주세요"
                    autoFocus
                    onChange={(e) => {
                      const v = e.target.value;
                      if ([...v].length <= 50) setField("scd_name", v);
                    }}
                    className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>

                {/* 시작일 / 종료일 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-gray-700">
                      시작일 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={ymdToInput(form.beg_date)}
                      onChange={(e) => {
                        const v = e.target.value.replace(/-/g, "");
                        setField("beg_date", v);
                        if (v && form.end_date && v > form.end_date) setField("end_date", v);
                      }}
                      className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-gray-700">
                      종료일 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={ymdToInput(form.end_date)}
                      min={ymdToInput(form.beg_date) || undefined}
                      onChange={(e) => {
                        const v = e.target.value.replace(/-/g, "");
                        if (v && form.beg_date && v < form.beg_date) return;
                        setField("end_date", v);
                      }}
                      className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                {/* 시작시간 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-gray-700">시작시간</label>
                  <input
                    type="time"
                    value={form.scd_time}
                    onChange={(e) => setField("scd_time", e.target.value)}
                    className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>

                {/* 비고 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-700">비고</label>
                    <span className={`text-xs ${[...form.scd_remark].length >= 250 ? "text-red-400 font-semibold" : "text-gray-400"}`}>
                      {[...form.scd_remark].length}/250
                    </span>
                  </div>
                  <textarea
                    value={form.scd_remark}
                    placeholder="비고를 입력해주세요 (선택)"
                    rows={3}
                    onChange={(e) => {
                      const v = e.target.value;
                      if ([...v].length <= 250) setField("scd_remark", v);
                    }}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                  />
                </div>

                {/* 에러 메시지 */}
                {formError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-xs text-red-600">{formError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 저장/취소 버튼 */}
            <div className="shrink-0 px-5 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 h-12 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white active:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 active:opacity-80"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────── 삭제 확인 다이얼로그 ──────────── */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (!deleting) setDeleteConfirmOpen(false); }}
          />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900">일정 삭제</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6 pl-[52px]">
              선택한 <strong>{selectedKeys.size}개</strong>의 일정을 삭제하시겠습니까?<br />
              <span className="text-xs text-gray-400 mt-0.5 block">삭제된 데이터는 복구할 수 없습니다.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 active:opacity-80"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
