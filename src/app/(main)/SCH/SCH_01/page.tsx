"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ChevronLeft, CalendarPlus, Search, Plus, Trash2, X, AlertCircle, CalendarDays,
} from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useMenuTitle } from "@/features/menu/use-menu-store";
import { usePagePermission } from "@/features/menu-permission/hooks/use-page-permission";
import type { CalScdRow } from "@/app/api/schedule-crud/route";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ──────────── 날짜 유틸 ──────────── */
function toYMD(d: Date) { return format(d, "yyyyMMdd"); }
function formatYMD(s: string) {
  const d = String(s ?? "").replace(/-/g, "");
  if (d.length !== 8) return String(s ?? "");
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

/* ──────────── 시간 유틸 ──────────── */
// 저장 형식: "am HH:00" / "pm HH:00"  (am: 01~11, pm: 12~23)
function parseTimeStr(val: string): { period: "am" | "pm"; hour: number } | null {
  if (!val) return null;
  const m = val.match(/^(am|pm)\s+(\d{1,2})(?::\d{2})?$/i);
  if (m) return { period: m[1].toLowerCase() as "am" | "pm", hour: parseInt(m[2], 10) };
  return null;
}
function buildTimeStr(period: "am" | "pm", hour: number): string {
  return `${period} ${String(hour).padStart(2, "0")}:00`;
}

const AM_HOURS = Array.from({ length: 12 }, (_, i) => i);      // 00~11
const PM_HOURS = Array.from({ length: 12 }, (_, i) => i + 12); // 12~23

function HourPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseTimeStr(value);
  const period = parsed?.period ?? null;
  const hour   = parsed?.hour   ?? (period === "pm" ? 12 : 0);
  const hours  = period === "pm" ? PM_HOURS : AM_HOURS;
  const [open, setOpen] = useState(false);

  function setPeriod(p: "am" | "pm") {
    if (period === p) { onChange(""); setOpen(false); return; }
    const defaultHour = p === "pm" ? 12 : 0;
    onChange(buildTimeStr(p, defaultHour));
  }
  function selectHour(h: number) {
    onChange(buildTimeStr(period ?? "am", h));
    setOpen(false);
  }

  return (
    <div className="relative min-h-[44px] rounded-xl border border-gray-200 bg-gray-50 flex items-center px-1 py-1 gap-1 min-w-0 overflow-visible">
      <div className="flex rounded-lg overflow-hidden shrink-0">
        {(["am", "pm"] as const).map((p) => (
          <button
            key={p} type="button"
            onClick={() => setPeriod(p)}
            style={{ fontSize: "11px" }}
            className={cn(
              "px-1.5 py-1 font-semibold transition-colors rounded-lg leading-none",
              period === p ? "bg-primary text-white" : "text-gray-400 hover:text-gray-600",
            )}
          >
            {p === "am" ? "오전" : "오후"}
          </button>
        ))}
      </div>
      {period && (
        <>
          <div className="w-px h-5 bg-gray-200 shrink-0" />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{ fontSize: "13px" }}
            className="flex-1 min-w-0 h-9 bg-transparent text-gray-900 text-left px-1 outline-none"
          >
            {String(hour).padStart(2, "0")}시
          </button>
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      )}
      {open && period && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[300] bg-white border border-gray-200 rounded-xl shadow-lg p-1 max-h-48 overflow-y-auto">
          <div className="flex flex-col">
            {hours.map((h) => (
              <button
                key={h} type="button"
                onClick={() => selectHour(h)}
                style={{ fontSize: "13px" }}
                className={cn(
                  "py-2 px-3 rounded-lg text-left font-medium transition-colors",
                  h === hour ? "bg-primary text-white" : "text-gray-700 active:bg-gray-100",
                )}
              >
                {String(h).padStart(2, "0")}시
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────── 날짜 피커 ──────────── */
function SchDatePickerField({
  value, onChange, placeholder = "날짜 선택", minYmd, holidayDates,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; minYmd?: string; holidayDates: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = value?.length === 8
    ? parseISO(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`)
    : undefined;

  const ColoredDayButton = useMemo(() => {
    const dates = holidayDates;
    return function DayButtonColored(props: React.ComponentProps<typeof CalendarDayButton>) {
      const { day, modifiers, className } = props;
      const dow = day.date.getDay();
      const dateStr = format(day.date, "yyyy-MM-dd");
      const isRed = dow === 0 || dates.has(dateStr);
      const isBlue = dow === 6 && !isRed;
      return (
        <CalendarDayButton
          {...props}
          className={cn(
            className,
            !modifiers.selected && !modifiers.disabled && isBlue && "text-blue-500 hover:text-blue-600",
            !modifiers.selected && !modifiers.disabled && isRed  && "text-red-500  hover:text-red-600",
          )}
        />
      );
    };
  }, [holidayDates]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="outline"
          className={cn("h-11 w-full justify-start pl-2 border-gray-200 bg-gray-50 font-normal overflow-hidden", !value && "text-gray-400")}
        >
          <CalendarDays className="mr-1 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span style={{ fontSize: "13px" }}>
            {value?.length === 8 ? `${value.slice(0,4)}.${value.slice(4,6)}.${value.slice(6,8)}` : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[300] w-auto p-0" align="start">
        <Calendar
          mode="single" selected={selectedDate}
          onSelect={(date) => { onChange(date ? format(date, "yyyyMMdd") : ""); setOpen(false); }}
          disabled={minYmd ? (date) => {
            const min = parseISO(`${minYmd.slice(0,4)}-${minYmd.slice(4,6)}-${minYmd.slice(6,8)}`);
            min.setHours(0,0,0,0); date.setHours(0,0,0,0); return date < min;
          } : undefined}
          locale={ko}
          formatters={{
            formatCaption: (date) => format(date, "yyyy년 M월", { locale: ko }),
            formatWeekdayName: (date) => format(date, "eeeee", { locale: ko }),
          }}
          components={{ DayButton: ColoredDayButton }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ──────────── 폼 상태 ──────────── */
type FormState = {
  scd_name: string; beg_date: string; end_date: string; scd_time: string; scd_remark: string;
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
  const [startDate, setStartDate] = useState(() => toYMD(startOfWeek(now, { weekStartsOn: 1 })));
  const [endDate, setEndDate]     = useState(() => toYMD(endOfWeek(now, { weekStartsOn: 1 })));
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.companyCode || !user?.corp_code) return;
    const year = String(now.getFullYear());
    fetch(`/api/leave/company-holidays?companyCode=${user.companyCode}&corpCode=${user.corp_code}&year=${year}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: { hdate: string }[] } | null) => {
        if (!data?.items) return;
        setHolidayDates(new Set(
          data.items.map(({ hdate }) => {
            const n = hdate.replace(/-/g, "");
            return `${n.slice(0,4)}-${n.slice(4,6)}-${n.slice(6,8)}`;
          }),
        ));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyCode, user?.corp_code]);

  const [rows, setRows]           = useState<CalScdRow[]>([]);
  const [loading, setLoading]     = useState(false);

  /* 모달 */
  const [modalOpen, setModalOpen]     = useState(false);
  const [editingRow, setEditingRow]   = useState<CalScdRow | null>(null);
  const [form, setForm]               = useState<FormState>(emptyForm(todayYMD));
  const [formError, setFormError]     = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);

  /* 삭제 확인 */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting]                   = useState(false);


  /* 마운트 시 자동 조회 */
  useEffect(() => {
    if (user?.companyCode && user?.emp_code) loadRows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyCode, user?.emp_code]);

  /* ── 조회 ── */
  async function loadRows() {
    if (!user?.companyCode || !user?.emp_code) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ companyCode: user.companyCode, empCode: user.emp_code, startDate, endDate });
      const res = await fetch(`/api/schedule-crud?${params.toString()}`);
      if (!res.ok) return;
      const data: { items: CalScdRow[] } = await res.json();
      const sorted = (data.items ?? []).sort((a, b) => (b.beg_date ?? "").localeCompare(a.beg_date ?? ""));
      setRows(sorted);
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

  function openEdit(row: CalScdRow) {
    setEditingRow(row);
    setForm({ scd_name: row.scd_name ?? "", beg_date: row.beg_date ?? "", end_date: row.end_date ?? "", scd_time: row.scd_time ?? "", scd_remark: row.scd_remark ?? "" });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setFormError(null); }

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
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyCode: user?.companyCode, emp_code: editingRow.emp_code, scd_month: editingRow.scd_month, scd_no1: editingRow.scd_no1, user_id: user?.user_id, scd_name: scd_name.trim(), beg_date, end_date, scd_time, scd_remark }),
        });
      } else {
        res = await fetch("/api/schedule-crud", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyCode: user?.companyCode, emp_code: user?.emp_code, user_id: user?.user_id, scd_name: scd_name.trim(), beg_date, end_date, scd_time, scd_remark }),
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
    if (!editingRow) return;
    setDeleting(true);
    try {
      await fetch("/api/schedule-crud", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode: user?.companyCode, emp_code: editingRow.emp_code, scd_month: editingRow.scd_month, scd_no1: editingRow.scd_no1 }),
      });
      setDeleteConfirmOpen(false);
      closeModal();
      await loadRows();
    } finally {
      setDeleting(false);
    }
  }

  /* ─────────────── 렌더 ─────────────── */
  return (
    <>
      <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">

        {/* 헤더 */}
        <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <CalendarPlus className="w-5 h-5 text-primary" />
            <h1 className="text-base font-bold text-gray-900">{pageTitle}</h1>
          </div>
        </header>

        {/* 조회조건 */}
        <div className="shrink-0 px-4 pt-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-xs font-medium text-gray-400 mb-2">조회기간</p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SchDatePickerField
                  value={startDate}
                  onChange={(v) => { setStartDate(v); if (v && endDate && v > endDate) setEndDate(v); }}
                  placeholder="시작일" holidayDates={holidayDates}
                />
              </div>
              <span className="text-gray-400 text-sm shrink-0">~</span>
              <div className="flex-1">
                <SchDatePickerField
                  value={endDate}
                  onChange={(v) => { if (v && startDate && v < startDate) return; setEndDate(v); }}
                  placeholder="종료일" minYmd={startDate || undefined} holidayDates={holidayDates}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="shrink-0 px-4 pt-2 flex items-center gap-1.5">
          <button
            onClick={openAdd} disabled={!perm.add}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            추가
          </button>
          <div className="flex-1" />
          <button
            onClick={loadRows} disabled={!perm.view}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40"
          >
            <Search className="w-3.5 h-3.5" />
            조회
          </button>
        </div>

        {/* 카드 목록 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-gray-400">불러오는 중...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-300">
              <CalendarDays className="w-10 h-10" />
              <p className="text-sm text-gray-400">등록된 일정이 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((row) => {
                const sameDay = row.beg_date && row.end_date && row.beg_date === row.end_date;
                return (
                  <div
                    key={row.scd_key}
                    onClick={() => openEdit(row)}
                    className="rounded-xl px-4 py-3.5 cursor-pointer active:opacity-80 transition-opacity"
                    style={{ backgroundColor: "#edf7ee", border: "1px solid #c8e6ca", boxShadow: "0 1px 4px 0 rgba(0,0,0,0.06)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#7abf82" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs truncate" style={{ color: "#4a9e5c" }}>
                            {formatYMD(row.beg_date ?? "")}
                            {!sameDay && ` ~ ${formatYMD(row.end_date ?? "")}`}
                          </span>
                          {row.scd_time ? (
                            <span className="text-xs text-gray-600 shrink-0">{row.scd_time}</span>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-gray-900 break-words">{row.scd_name}</p>
                        {row.scd_remark ? (
                          <p className="text-xs text-gray-500 mt-0.5 break-words">{row.scd_remark}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 추가/수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{editingRow ? "일정 수정" : "일정 추가"}</h2>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-5">
                {/* 일정명 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-700">일정명 <span className="text-red-400">*</span></label>
                    <span className={`text-xs ${[...form.scd_name].length >= 50 ? "text-red-400 font-semibold" : "text-gray-400"}`}>{[...form.scd_name].length}/50</span>
                  </div>
                  <input
                    type="text" value={form.scd_name} placeholder="일정명을 입력해주세요" autoFocus
                    onChange={(e) => { const v = e.target.value; if ([...v].length <= 50) setField("scd_name", v); }}
                    className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>

                {/* 시작일 + 시작시간 */}
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1.5 min-w-0 basis-2/5 shrink-0">
                    <label className="text-sm font-semibold text-gray-700">시작일 <span className="text-red-400">*</span></label>
                    <SchDatePickerField
                      value={form.beg_date}
                      onChange={(v) => { setField("beg_date", v); if (v && form.end_date && v > form.end_date) setField("end_date", v); }}
                      placeholder="시작일" holidayDates={holidayDates}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-0 basis-3/5">
                    <label className="text-sm font-semibold text-gray-700">시작시간</label>
                    <HourPicker value={form.scd_time} onChange={(v) => setField("scd_time", v)} />
                  </div>
                </div>

                {/* 종료일 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-gray-700">종료일 <span className="text-red-400">*</span></label>
                  <SchDatePickerField
                    value={form.end_date}
                    onChange={(v) => { if (v && form.beg_date && v < form.beg_date) return; setField("end_date", v); }}
                    placeholder="종료일 선택" minYmd={form.beg_date || undefined} holidayDates={holidayDates}
                  />
                </div>

                {/* 비고 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-700">비고</label>
                    <span className={`text-xs ${[...form.scd_remark].length >= 250 ? "text-red-400 font-semibold" : "text-gray-400"}`}>{[...form.scd_remark].length}/250</span>
                  </div>
                  <textarea
                    value={form.scd_remark} placeholder="비고를 입력해주세요 (선택)" rows={3}
                    onChange={(e) => { const v = e.target.value; if ([...v].length <= 250) setField("scd_remark", v); }}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  />
                </div>

                {formError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-xs text-red-600">{formError}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 px-5 py-4 border-t border-gray-100 flex gap-3">
              {editingRow ? (
                perm.del && (
                  <button
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={saving}
                    className="flex-1 h-12 rounded-xl border border-red-100 text-sm font-semibold text-red-500 bg-white active:bg-red-50 disabled:opacity-50"
                  >
                    삭제
                  </button>
                )
              ) : (
                <button onClick={closeModal} className="flex-1 h-12 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white active:bg-gray-50">취소</button>
              )}
              <button onClick={handleSave} disabled={saving} className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 active:opacity-80">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!deleting) setDeleteConfirmOpen(false); }} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900">일정 삭제</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6 pl-[52px]">
              이 일정을 삭제하시겠습니까?<br />
              <span className="text-xs text-gray-400 mt-0.5 block">삭제된 데이터는 복구할 수 없습니다.</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmOpen(false)} disabled={deleting} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-50">취소</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 active:opacity-80">
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
