"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Bell, X, BellOff, Loader2, FileText } from "lucide-react";
import { useMenuStore } from "@/features/menu/use-menu-store";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

// ── Types ────────────────────────────────────────────────────

type Employee = {
  emp_code: string;
  emp_name: string;
  corp_code: string;
  corp_name: string;
  dpt_code: string;
  dpt_name: string;
  emp_position: string;
  emp_position_name: string;
  first_date: string;
  year_alday: number;
  year_emday: number;
  year_reday: number;
  emp_status: string;
  mobile_flag: string;
  has_subscription: boolean;
  prt_count: number;
};

type MonthEntry = { m: number; date: string; cnt: number; rmk: string };

type Prt = {
  prt_no1: number;
  year_st: string;
  year_stdate: string;
  hurry_date: string;
  year_alday: number;
  year_emday: number;
  year_reday: number;
  send_yn: string;
  mobile_send_yn: string;
  months: MonthEntry[];
};

// ── Helpers ──────────────────────────────────────────────────

function parsePrt(raw: Record<string, unknown>): Prt {
  return {
    prt_no1:      Number(raw.prt_no1 ?? 0),
    year_st:      String(raw.year_st ?? ""),
    year_stdate:  String(raw.year_stdate ?? ""),
    hurry_date:   String(raw.hurry_date ?? ""),
    year_alday:   Number(raw.year_alday ?? 0),
    year_emday:   Number(raw.year_emday ?? 0),
    year_reday:   Number(raw.year_reday ?? 0),
    send_yn:      String(raw.send_yn ?? "N"),
    mobile_send_yn: String(raw.mobile_send_yn ?? "N"),
    months: Array.from({ length: 12 }, (_, i) => i + 1)
      .filter((m) => raw[`m${m}_date`])
      .map((m) => ({
        m,
        date: String(raw[`m${m}_date`] ?? ""),
        cnt:  Number(raw[`m${m}_cnt`]  ?? 0),
        rmk:  String(raw[`m${m}_rmk`]  ?? ""),
      })),
  };
}

function fmtDate(d: string) {
  if (!d || d.length < 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function remanColor(days: number) {
  if (days === 0) return "text-gray-400";
  if (days >= 10) return "text-red-500";
  if (days >= 5) return "text-orange-500";
  return "text-yellow-600";
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [String(currentYear - 1), String(currentYear)];

// ── Page ─────────────────────────────────────────────────────

export default function LeaveNotifyPage() {
  const router = useRouter();
  const perm = useMenuStore((s) => s.perms["MOBILE_B_005"]);
  const user = useAuthStore((s) => s.user);

  const canViewOtherEmp  = perm?.gpr3 ?? false;
  const canViewOtherDept = perm?.gpr2 ?? false;

  const companyCode = user?.companyCode ?? "";
  const corpCode    = user?.corp_code   ?? "";
  const userId      = user?.user_id     ?? "";

  const [year, setYear]           = useState(String(currentYear - 1));
  const [remainOnly, setRemainOnly] = useState(true);

  const defaultYearStdate = `${currentYear - 1}-12-31`;
  const defaultHurryDate  = new Date().toISOString().slice(0, 10);
  const [filterYearStdate, setFilterYearStdate] = useState(defaultYearStdate);
  const [filterHurryDate,  setFilterHurryDate]  = useState(defaultHurryDate);
  const [filterDept, setFilterDept] = useState("");
  const [filterEmp, setFilterEmp]   = useState("");
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [prtList, setPrtList]         = useState<Prt[]>([]);
  const [prtLoading, setPrtLoading]   = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<{ emp: Employee; prtNo1: number; yearSt: string } | null>(null);
  const [sending, setSending] = useState(false);

  const [createTarget, setCreateTarget] = useState<Employee | null>(null);
  const [createForm, setCreateForm] = useState({ yearStdate: "", hurryDate: "" });
  const [creating, setCreating] = useState(false);

  const [sentSet, setSentSet] = useState<Set<string>>(new Set());
  const [selectedPrtIdx, setSelectedPrtIdx] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setSelectedPrtIdx(0); setDeleteConfirm(false); }, [prtList]);

  // ── Fetch list ───────────────────────────────────────────

  const toErpDate = (v: string) => v.replace(/-/g, "");

  const fetchList = useCallback(async () => {
    if (!companyCode || !corpCode) return;
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        companyCode, corpCode, mode: "LIST",
        year, dptCode: " ", empStatus: " ", empCode: " ",
        yearStdate: toErpDate(filterYearStdate) || " ",
        hurryDate:  toErpDate(filterHurryDate)  || " ",
      });
      const res = await fetch(`/api/leave/notify?${params}`);
      const data: { items?: Employee[] } = await res.json();
      setEmployees(Array.isArray(data.items) ? data.items : []);
    } catch {
      setEmployees([]);
    } finally {
      setListLoading(false);
    }
  }, [companyCode, corpCode, year, filterYearStdate, filterHurryDate]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // ── Fetch detail ─────────────────────────────────────────

  const fetchDetail = useCallback(async (emp: Employee) => {
    if (!companyCode || !corpCode) return;
    setPrtLoading(true);
    setPrtList([]);
    try {
      const params = new URLSearchParams({
        companyCode, corpCode, mode: "DETAIL",
        year, dptCode: " ", empStatus: " ", empCode: emp.emp_code,
        yearStdate: toErpDate(filterYearStdate) || " ",
        hurryDate:  toErpDate(filterHurryDate)  || " ",
      });
      const res = await fetch(`/api/leave/notify?${params}`);
      const data: { items?: Record<string, unknown>[] } = await res.json();
      setPrtList(Array.isArray(data.items) ? data.items.map(parsePrt) : []);
    } catch {
      setPrtList([]);
    } finally {
      setPrtLoading(false);
    }
  }, [companyCode, corpCode, year, filterYearStdate, filterHurryDate]);

  function handleSelectEmp(emp: Employee) {
    setSelectedEmp(emp);
    fetchDetail(emp);
  }

  async function handleCreate() {
    if (!createTarget || !companyCode || !corpCode || !userId) return;
    if (!createForm.yearStdate || !createForm.hurryDate) return;
    setCreating(true);
    try {
      const res = await fetch("/api/leave/notify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode, corpCode,
          empCode: createTarget.emp_code,
          yearSt: year,
          yearStdate: toErpDate(createForm.yearStdate),
          hurryDate:  toErpDate(createForm.hurryDate),
          userId,
        }),
      });
      if (res.ok) {
        setCreateTarget(null);
        setCreateForm({ yearStdate: "", hurryDate: "" });
        await fetchList();
      }
    } finally {
      setCreating(false);
    }
  }

  // 카드의 전송 버튼: DETAIL 로드 후 미전송 첫 명세 선택
  async function handleCardSend(emp: Employee) {
    if (!companyCode || !corpCode) return;
    try {
      const params = new URLSearchParams({
        companyCode, corpCode, mode: "DETAIL",
        year, dptCode: " ", empStatus: " ", empCode: emp.emp_code,
        yearStdate: toErpDate(filterYearStdate) || " ",
        hurryDate:  toErpDate(filterHurryDate)  || " ",
      });
      const res = await fetch(`/api/leave/notify?${params}`);
      const data: { items?: Record<string, unknown>[] } = await res.json();
      const prts = Array.isArray(data.items) ? data.items.map(parsePrt) : [];
      const first = prts.find((p) => p.mobile_send_yn !== "Y");
      if (first) setConfirmTarget({ emp, prtNo1: first.prt_no1, yearSt: first.year_st });
    } catch { /* 무시 */ }
  }

  // ── Send ─────────────────────────────────────────────────

  async function handleConfirmSend() {
    if (!confirmTarget || !companyCode || !corpCode || !userId) return;
    setSending(true);
    try {
      const { emp, prtNo1, yearSt: prtYearSt } = confirmTarget;
      const res = await fetch("/api/leave/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode, corpCode, empCode: emp.emp_code, yearSt: prtYearSt, prtNo1, userId }),
      });
      if (res.ok) {
        setSentSet((prev) => new Set([...prev, `${emp.emp_code}-${prtYearSt}-${prtNo1}`]));
        setPrtList((prev) =>
          prev.map((p) => p.prt_no1 === prtNo1 && p.year_st === prtYearSt ? { ...p, mobile_send_yn: "Y" } : p)
        );
      }
    } finally {
      setSending(false);
      setConfirmTarget(null);
    }
  }

  async function handleDelete() {
    if (!selectedEmp || !companyCode || !corpCode) return;
    const prt = prtList[selectedPrtIdx];
    if (!prt) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/leave/notify", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode, corpCode,
          empCode: selectedEmp.emp_code,
          yearSt: prt.year_st,
          prtNo1: prt.prt_no1,
        }),
      });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      const newList = prtList.filter((_, i) => i !== selectedPrtIdx);
      setPrtList(newList);
      setDeleteConfirm(false);
      if (newList.length === 0) setSelectedEmp(null);
      await fetchList();
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────

  const deptOptions = useMemo(
    () => [...new Set(employees.map((e) => e.dpt_name))].filter(Boolean),
    [employees],
  );

  const empCandidates = useMemo(
    () => employees.filter((e) => !filterDept || e.dpt_name === filterDept),
    [employees, filterDept],
  );

  const displayEmployees = useMemo(() => {
    const filtered = employees.filter((e) => {
      if (remainOnly && e.year_reday <= 0) return false;
      if (filterDept && e.dpt_name !== filterDept) return false;
      if (filterEmp && e.emp_code !== filterEmp) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const rankA = a.prt_count > 0 && a.mobile_flag === "Y" && a.has_subscription ? 0
        : a.prt_count > 0 ? 1
        : 2;
      const rankB = b.prt_count > 0 && b.mobile_flag === "Y" && b.has_subscription ? 0
        : b.prt_count > 0 ? 1
        : 2;
      return rankA - rankB;
    });
  }, [employees, remainOnly, filterDept, filterEmp]);

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-semibold text-gray-900 text-base">연차사용 알림 조회</h1>
      </header>

      {/* 필터 */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 space-y-2">
        {/* 년도 / 미사용만 */}
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>

          <button
            onClick={() => setRemainOnly((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              remainOnly ? "bg-primary/10 text-primary font-medium" : "bg-gray-100 text-gray-500"
            }`}
          >
            미사용만
          </button>

          <span className="ml-auto text-xs text-gray-400">
            {listLoading ? "…" : `${displayEmployees.length}명`}
          </span>
        </div>

        {/* 기준일 ~ 촉진일 */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[10px] text-gray-400 px-0.5">기준일</span>
            <input
              type="date"
              value={filterYearStdate}
              onChange={(e) => setFilterYearStdate(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <span className="text-gray-300 mt-4">~</span>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[10px] text-gray-400 px-0.5">촉진일</span>
            <input
              type="date"
              value={filterHurryDate}
              onChange={(e) => setFilterHurryDate(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {(canViewOtherDept || canViewOtherEmp) && (
          <div className="flex gap-2">
            {canViewOtherDept && (
              <select
                value={filterDept}
                onChange={(e) => { setFilterDept(e.target.value); setFilterEmp(""); }}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">전체 부서</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
            {canViewOtherEmp && (
              <div className="flex-1 relative">
                <button
                  onClick={() => setShowEmpDropdown((v) => !v)}
                  className="w-full flex items-center justify-between text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <span className={filterEmp ? "text-gray-700" : "text-gray-300"}>
                    {filterEmp
                      ? (employees.find((e) => e.emp_code === filterEmp)?.emp_name ?? "전체 사원")
                      : "전체 사원"}
                  </span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showEmpDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowEmpDropdown(false)} />
                    <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto">
                      <button
                        onClick={() => { setFilterEmp(""); setShowEmpDropdown(false); }}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                      >
                        전체 사원
                      </button>
                      {empCandidates.map((e) => (
                        <button
                          key={e.emp_code}
                          onClick={() => { setFilterEmp(e.emp_code); setShowEmpDropdown(false); }}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 ${filterEmp === e.emp_code ? "bg-primary/5" : ""}`}
                        >
                          <span className="text-sm text-gray-800 font-medium">{e.emp_name}</span>
                          <span className="text-xs text-gray-400 ml-1.5">{e.dpt_name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-20 space-y-2">
        {listLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {!listLoading && displayEmployees.map((emp) => {
          return (
            <div key={emp.emp_code} className="bg-white rounded-xl border border-gray-100 p-4">
              <button className="w-full text-left" onClick={() => handleSelectEmp(emp)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{emp.emp_name}</span>
                      {emp.emp_position_name && (
                        <span className="text-xs text-gray-400">{emp.emp_position_name}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 mt-0.5 block">{emp.dpt_name}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${remanColor(emp.year_reday)}`}>
                      {emp.year_reday}일
                    </span>
                    <span className="text-xs text-gray-400 block">미사용</span>
                  </div>
                </div>

                <div className="mt-3 flex gap-3">
                  {[
                    { label: "발생", value: emp.year_alday },
                    { label: "사용", value: emp.year_emday },
                    { label: "잔여", value: emp.year_reday },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex-1 bg-gray-50 rounded-lg py-2 text-center">
                      <div className="text-xs text-gray-400">{label}</div>
                      <div className="text-sm font-semibold text-gray-700 mt-0.5">{value}일</div>
                    </div>
                  ))}
                </div>
              </button>

              {emp.year_reday > 0 && (
                <div className="mt-3">
                  {emp.prt_count === 0 ? (
                    <button
                      onClick={() => {
                        setCreateTarget(emp);
                        setCreateForm({ yearStdate: filterYearStdate, hurryDate: filterHurryDate });
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 active:bg-gray-100"
                    >
                      명세 생성하기
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSelectEmp(emp)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary/40 text-primary text-sm font-medium hover:bg-primary/5 active:bg-primary/10"
                    >
                      <FileText className="w-4 h-4" />
                      명세 보기
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!listLoading && displayEmployees.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BellOff className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">미사용 연차 대상자가 없습니다</p>
          </div>
        )}
      </div>

      {/* 명세 생성 모달 */}
      {createTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[200]" onClick={() => !creating && setCreateTarget(null)} />
          <div className="fixed inset-x-8 top-1/2 -translate-y-1/2 z-[201] bg-white rounded-2xl shadow-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-1">명세 생성</h3>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-800">{createTarget.emp_name}</span>님의 {year}년 연차 명세를 생성합니다.
            </p>
            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1">기준일</label>
                <input
                  type="date"
                  value={createForm.yearStdate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, yearStdate: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">촉진일 <span className="text-red-400">*</span></label>
                <input
                  type="date"
                  value={createForm.hurryDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, hurryDate: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCreateTarget(null)}
                disabled={creating}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 font-medium disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.yearStdate || !createForm.hurryDate}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                생성
              </button>
            </div>
          </div>
        </>
      )}

      {/* 전송 확인 모달 */}
      {confirmTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[200]" onClick={() => !sending && setConfirmTarget(null)} />
          <div className="fixed inset-x-8 top-1/2 -translate-y-1/2 z-[201] bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto mb-4">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-center font-semibold text-gray-900 mb-1">모바일 알림 전송</h3>
            <p className="text-center text-sm text-gray-500 mb-1">
              <span className="font-medium text-gray-800">{confirmTarget.emp.emp_name}</span>님에게
            </p>
            <p className="text-center text-sm text-gray-500 mb-6">
              미사용 연차 알림을 전송하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={sending}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 font-medium disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={sending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                전송
              </button>
            </div>
          </div>
        </>
      )}

      {/* 명세 상세 모달 */}
      {selectedEmp && (() => {
        const selectedPrt = prtList[selectedPrtIdx] ?? null;
        const sentKey = selectedPrt ? `${selectedEmp.emp_code}-${selectedPrt.year_st}-${selectedPrt.prt_no1}` : "";
        const sent = selectedPrt ? (sentSet.has(sentKey) || selectedPrt.mobile_send_yn === "Y") : false;
        const canSend = selectedPrt && !sent && selectedEmp.year_reday > 0
          && selectedEmp.mobile_flag === "Y" && selectedEmp.has_subscription;

        return (
          <>
            <div className="fixed inset-0 bg-black/50 z-[100]" onClick={() => !deleting && setSelectedEmp(null)} />
            <div className="fixed inset-x-4 top-[5%] bottom-[5%] z-[101] bg-white rounded-2xl flex flex-col shadow-xl">

              {/* 헤더 */}
              <div className="shrink-0 px-4 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{selectedEmp.emp_name}</span>
                    {selectedEmp.emp_position_name && (
                      <span className="text-xs text-gray-400">{selectedEmp.emp_position_name}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{selectedEmp.dpt_name}</span>
                </div>
                <button onClick={() => setSelectedEmp(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* 연차 요약 */}
              <div className="shrink-0 px-4 py-3 flex gap-3 border-b border-gray-100">
                {[
                  { label: "발생", value: selectedEmp.year_alday },
                  { label: "사용", value: selectedEmp.year_emday },
                  { label: "잔여", value: selectedEmp.year_reday, highlight: true },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="flex-1 bg-gray-50 rounded-lg py-2 text-center">
                    <div className="text-xs text-gray-400">{label}</div>
                    <div className={`text-sm font-bold mt-0.5 ${highlight ? remanColor(value) : "text-gray-700"}`}>{value}일</div>
                  </div>
                ))}
              </div>

              {/* 탭 (명세 2개 이상일 때) */}
              {prtList.length > 1 && (
                <div className="shrink-0 flex border-b border-gray-100 overflow-x-auto">
                  {prtList.map((prt, i) => (
                    <button
                      key={`${prt.year_st}-${prt.prt_no1}`}
                      onClick={() => { setSelectedPrtIdx(i); setDeleteConfirm(false); }}
                      className={`shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                        i === selectedPrtIdx
                          ? "border-primary text-primary"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {fmtDate(prt.year_stdate)}
                    </button>
                  ))}
                </div>
              )}

              {/* 명세 내용 */}
              <div className="flex-1 overflow-y-auto">
                {prtLoading && (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  </div>
                )}

                {!prtLoading && prtList.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                    <p className="text-sm">생성된 명세가 없습니다</p>
                    <p className="text-xs mt-1">ERP에서 명세를 먼저 생성해주세요</p>
                  </div>
                )}

                {!prtLoading && selectedPrt && (
                  <>
                    {/* 기준일/촉진일/전송상태 */}
                    <div className="px-4 pt-3 pb-2 flex items-start justify-between">
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <div>기준일: <span className="text-gray-700 font-medium">{fmtDate(selectedPrt.year_stdate)}</span></div>
                        <div>촉진일: <span className="text-gray-700 font-medium">{fmtDate(selectedPrt.hurry_date)}</span></div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sent ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                          모바일 {sent ? "전송완료" : "미전송"}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${selectedPrt.send_yn === "Y" ? "bg-blue-100 text-blue-500" : "bg-gray-100 text-gray-400"}`}>
                          메일 {selectedPrt.send_yn === "Y" ? "전송완료" : "미전송"}
                        </span>
                      </div>
                    </div>

                    {/* 월별 데이터 */}
                    <div className="divide-y divide-gray-50 px-0">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const entry = selectedPrt.months.find((x) => x.m === m);
                        return (
                          <div key={m} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                            <span className={`w-8 text-xs font-medium shrink-0 ${entry ? "text-primary" : "text-gray-300"}`}>{m}월</span>
                            <span className={`flex-1 text-xs ${entry ? "text-gray-600" : "text-gray-300"}`}>{entry ? entry.date : "—"}</span>
                            <span className={`text-xs font-semibold w-10 text-right ${entry ? "text-gray-700" : "text-gray-300"}`}>
                              {entry ? `${entry.cnt}일` : "—"}
                            </span>
                            {entry?.rmk ? (
                              <span className="text-xs text-gray-400 max-w-[60px] truncate">{entry.rmk}</span>
                            ) : (
                              <span className="w-[60px]" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* 하단 버튼 */}
              {!prtLoading && selectedPrt && (
                <div className="shrink-0 border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
                  {deleteConfirm && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
                      <span className="text-xs text-red-500 flex-1">삭제하면 복구할 수 없습니다. 계속할까요?</span>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        disabled={deleting}
                        className="text-xs text-gray-500 font-medium px-2 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs text-white font-medium px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 flex items-center gap-1"
                      >
                        {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                        삭제
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirm((v) => !v)}
                      className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 active:bg-red-100"
                    >
                      삭제하기
                    </button>
                    {canSend ? (
                      <button
                        onClick={() => setConfirmTarget({ emp: selectedEmp, prtNo1: selectedPrt.prt_no1, yearSt: selectedPrt.year_st })}
                        className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90"
                      >
                        <Bell className="w-4 h-4" />
                        모바일 알림 전송
                      </button>
                    ) : (
                      <div className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-400 text-sm flex items-center justify-center gap-2">
                        <BellOff className="w-4 h-4" />
                        {sent ? "전송완료" : selectedEmp.mobile_flag !== "Y" ? "모바일 권한 없음" : !selectedEmp.has_subscription ? "앱 미로그인" : "전송 불가"}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </>
        );
      })()}
    </div>
  );
}
