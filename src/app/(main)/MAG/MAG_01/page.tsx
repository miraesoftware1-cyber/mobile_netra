"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Search, ChevronDown, Smartphone, Wifi, WifiOff, X, BanIcon } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useMenuStore } from "@/features/menu/use-menu-store";

// ── Types ─────────────────────────────────────────────────────

type Employee = {
  emp_code: string;
  emp_name: string;
  corp_code: string;
  corp_name: string;
  dpt_code: string;
  dpt_name: string;
  emp_position: string;
  emp_position_name: string;
  cel_no: string;
  mobile_flag: string;
  emp_status: string;
  first_date: string;
  has_subscription: boolean;
};

type StatusFilter = "mobile_ok" | "subscribed" | "no_mobile" | "not_subscribed";


const STATUS_FILTERS: { key: StatusFilter; label: string; icon: React.ReactNode; activeClass: string }[] = [
  {
    key: "mobile_ok",
    label: "모바일 권한",
    icon: <Smartphone className="w-3.5 h-3.5" />,
    activeClass: "bg-primary/10 text-primary border-primary/30",
  },
  {
    key: "subscribed",
    label: "앱 로그인",
    icon: <Wifi className="w-3.5 h-3.5" />,
    activeClass: "bg-green-50 text-green-600 border-green-200",
  },
  {
    key: "no_mobile",
    label: "권한 없음",
    icon: <BanIcon className="w-3.5 h-3.5" />,
    activeClass: "bg-gray-100 text-gray-600 border-gray-300",
  },
  {
    key: "not_subscribed",
    label: "미로그인",
    icon: <WifiOff className="w-3.5 h-3.5" />,
    activeClass: "bg-orange-50 text-orange-500 border-orange-200",
  },
];

// ── Page ──────────────────────────────────────────────────────

export default function MobileRecipientsPage() {
  const router = useRouter();
  const perm = useMenuStore((s) => s.perms["MOBILE_E_001"]);
  const user = useAuthStore((s) => s.user);

  const canViewOtherDept = perm?.gpr2 ?? false;
  const canViewOtherEmp  = perm?.gpr3 ?? false;

  const companyCode = user?.companyCode ?? "";
  const corpCode    = user?.corp_code   ?? "";
  const myEmpCode   = user?.emp_code    ?? "";
  const myDptCode   = user?.dpt_code    ?? "";

  const [employees, setEmployees]       = useState<Employee[]>([]);
  const [loading, setLoading]           = useState(false);
  const [searched, setSearched]         = useState(false);

  const [filterDept, setFilterDept]       = useState("");
  const [filterName, setFilterName]       = useState("");
  const [showNameDrop, setShowNameDrop]   = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<StatusFilter>>(new Set());
  const [showDeptDrop, setShowDeptDrop]   = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const deptOptions = useMemo(
    () => [...new Set(employees.map((e) => e.dpt_name))].filter(Boolean).sort(),
    [employees],
  );

  const nameCandidates = useMemo(() => {
    const q = filterName.trim();
    if (!q) return [];
    return employees.filter((e) => e.emp_name.includes(q)).slice(0, 20);
  }, [employees, filterName]);

  const displayList = useMemo(() => {
    return employees.filter((e) => {
      if (!canViewOtherEmp  && e.emp_code !== myEmpCode) return false;
      if (!canViewOtherDept && e.dpt_code !== myDptCode) return false;
      if (filterDept && e.dpt_name !== filterDept) return false;
      if (filterName.trim() && !e.emp_name.includes(filterName.trim())) return false;
      if (activeFilters.has("mobile_ok")      && e.mobile_flag !== "Y") return false;
      if (activeFilters.has("subscribed")     && !e.has_subscription)   return false;
      if (activeFilters.has("no_mobile")      && e.mobile_flag === "Y") return false;
      if (activeFilters.has("not_subscribed") && e.has_subscription)    return false;
      return true;
    });
  }, [employees, filterDept, filterName, activeFilters, canViewOtherEmp, canViewOtherDept, myEmpCode, myDptCode]);

  const fetchData = useCallback(async () => {
    if (!companyCode || !corpCode) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        companyCode, corpCode,
        dptCode:   "",
        empName:   "",
        empStatus: "1",
      });
      const res = await window.fetch(`/api/mobile/recipients?${params}`);
      const data: { items?: Employee[] } = await res.json();
      setEmployees(Array.isArray(data.items) ? data.items : []);
      setSearched(true);
    } catch {
      setEmployees([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [companyCode, corpCode]);

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    setFilterDept("");
    setFilterName("");
    setActiveFilters(new Set());
    fetchData();
  }

  function toggleStatusFilter(key: StatusFilter) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const mobileOk = (e: Employee) => e.mobile_flag === "Y";
  const subOk    = (e: Employee) => e.has_subscription;

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
      {/* 헤더 */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-semibold text-gray-900 text-base flex-1">알림 수신 대상자 관리</h1>
        {!canViewOtherEmp && !canViewOtherDept && (
          <button
            onClick={handleSearch}
            disabled={loading}
            className="shrink-0 h-9 px-3 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            <Search className="w-4 h-4" />
            조회
          </button>
        )}
      </header>

      {/* 필터 — 권한 있을 때만 표시 */}
      {(canViewOtherEmp || canViewOtherDept) && (
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 space-y-2">

        {/* 성명 검색 (타사원 권한) — 수기 입력 + 목록 선택 */}
        {canViewOtherEmp && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={nameRef}
              type="text"
              placeholder="성명으로 검색 (직접 입력 또는 목록 선택)"
              value={filterName}
              onChange={(e) => { setFilterName(e.target.value); setShowNameDrop(true); }}
              onFocus={() => setShowNameDrop(true)}
              onKeyDown={(e) => { if (e.key === "Enter") { setShowNameDrop(false); } }}
              className="w-full h-11 pl-9 pr-9 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary/50"
            />
            {filterName && (
              <button
                onClick={() => { setFilterName(""); setShowNameDrop(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
            {showNameDrop && nameCandidates.length > 0 && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowNameDrop(false)} />
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto">
                  {nameCandidates.map((e) => (
                    <button
                      key={e.emp_code}
                      onClick={() => { setFilterName(e.emp_name); setShowNameDrop(false); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-2"
                    >
                      <span className="text-sm text-gray-800 font-medium">{e.emp_name}</span>
                      <span className="text-xs text-gray-400">{e.dpt_name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 부서 드롭다운 + 조회 */}
        <div className="flex gap-2 items-center">
          {canViewOtherDept && (
            <div className="relative flex-1">
              <button
                onClick={() => setShowDeptDrop((v) => !v)}
                className="relative h-11 w-full border border-gray-200 rounded-lg bg-white overflow-hidden text-left focus:outline-none"
              >
                <div className="absolute inset-0 px-3 pr-8 flex items-center">
                  <span className={`text-sm truncate ${filterDept ? "text-gray-700" : "text-gray-400"}`}>
                    {filterDept || "전체 부서"}
                  </span>
                </div>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </button>
              {showDeptDrop && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDeptDrop(false)} />
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto">
                    <button
                      onClick={() => { setFilterDept(""); setShowDeptDrop(false); }}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                    >
                      전체 부서
                    </button>
                    {deptOptions.map((d) => (
                      <button
                        key={d}
                        onClick={() => { setFilterDept(d); setShowDeptDrop(false); }}
                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 ${filterDept === d ? "text-primary font-medium" : "text-gray-700"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={handleSearch}
            disabled={loading}
            className="shrink-0 h-11 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 ml-auto"
          >
            <Search className="w-4 h-4" />
            조회
          </button>
        </div>

        {searched && (
          <p className="text-xs text-gray-400">
            {loading ? "조회 중…" : `${displayList.length}명`}
          </p>
        )}
      </div>
      )}

      {/* 카운트 — 필터 없을 때만 */}
      {!canViewOtherEmp && !canViewOtherDept && searched && (
        <div className="shrink-0 px-4 py-1.5 bg-white border-b border-gray-100">
          <p className="text-xs text-gray-400">{loading ? "조회 중…" : `${displayList.length}명`}</p>
        </div>
      )}

      {/* 상태 필터 버튼 */}
      {searched && !loading && (
        <div className="shrink-0 px-4 py-2 flex gap-2 bg-white border-b border-gray-100 overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => toggleStatusFilter(f.key)}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                activeFilters.has(f.key)
                  ? f.activeClass
                  : "bg-white text-gray-400 border-gray-200"
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-3 pb-6 space-y-2">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && searched && displayList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-sm">조회 결과가 없습니다</p>
          </div>
        )}

        {!loading && displayList.map((emp) => (
          <div key={emp.emp_code} className="bg-white rounded-xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
            {/* 아이콘 영역 */}
            <div className="shrink-0 flex flex-col items-center gap-1">
              {mobileOk(emp)
                ? <Smartphone className="w-5 h-5 text-primary" />
                : <BanIcon className="w-5 h-5 text-gray-300" />}
              {subOk(emp)
                ? <Wifi className="w-4 h-4 text-green-500" />
                : <WifiOff className="w-4 h-4 text-gray-300" />}
            </div>

            {/* 직원 정보 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 text-sm">{emp.emp_name}</span>
                {emp.emp_position_name && (
                  <span className="text-xs text-gray-400">{emp.emp_position_name}</span>
                )}
                {emp.emp_status !== "1" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-400">퇴직</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{emp.dpt_name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{emp.cel_no || "—"}</p>
            </div>

            {/* 상태 뱃지 */}
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${mobileOk(emp) ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-400"}`}>
                {mobileOk(emp) ? "권한 O" : "권한 X"}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${subOk(emp) ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                {subOk(emp) ? "로그인 O" : "로그인 X"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
