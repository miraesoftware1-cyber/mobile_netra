"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, AlertCircle, AlertTriangle, Users, User, Building2, Zap, Bell, Save, ChevronDown, ChevronUp } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

const APPROVAL_MENUS = [
  { id: "LEAVE_01", name: "연차 신청" },
  { id: "EXP_01",   name: "지출 결의" },
];

type StepMember = { empCode: string; empName: string };

type Step = {
  stepNo: number;
  type: string;
  members: StepMember[];
  threshold: number;
  allowFinalDecision: boolean;
  pushEnabled: boolean;
  messageTitle: string;
  messageBody: string;
};

type ProcessInfo = {
  menuId: string;
  menuName: string;
  exists: boolean;
  procName: string;
  steps: Step[];
};

type PushConfig = {
  apvBtnLabel: string;
  rejBtnLabel: string;
  apvBtnAction: string;
  rejBtnAction: string;
};

const APV_ACTION_OPTIONS = [
  { value: "open_app",       label: "앱 열고 확인" },
  { value: "silent_approve", label: "바로 승인" },
];
const REJ_ACTION_OPTIONS = [
  { value: "require_reason", label: "사유 입력 필수" },
  { value: "silent_reject",  label: "바로 반려" },
];

function defaultConfig(): PushConfig {
  return { apvBtnLabel: "승인", rejBtnLabel: "반려", apvBtnAction: "open_app", rejBtnAction: "require_reason" };
}

function PushConfigSection({ menuId, initial }: { menuId: string; initial: PushConfig }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<PushConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setCfg(initial); }, [initial]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/approval/push-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuId, ...cfg }),
    }).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [menuId, cfg]);

  return (
    <div className="border-t border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">푸시 알림 버튼 설정</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* 승인 버튼 라벨 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-28 shrink-0">승인 버튼 라벨</span>
            <input
              type="text"
              value={cfg.apvBtnLabel}
              onChange={(e) => setCfg((c) => ({ ...c, apvBtnLabel: e.target.value }))}
              className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="승인"
            />
          </div>
          {/* 반려 버튼 라벨 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-28 shrink-0">반려 버튼 라벨</span>
            <input
              type="text"
              value={cfg.rejBtnLabel}
              onChange={(e) => setCfg((c) => ({ ...c, rejBtnLabel: e.target.value }))}
              className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="반려"
            />
          </div>
          {/* 승인 버튼 동작 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-28 shrink-0">승인 버튼 동작</span>
            <select
              value={cfg.apvBtnAction}
              onChange={(e) => setCfg((c) => ({ ...c, apvBtnAction: e.target.value }))}
              className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:border-primary"
            >
              {APV_ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {/* 반려 버튼 동작 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-28 shrink-0">반려 버튼 동작</span>
            <select
              value={cfg.rejBtnAction}
              onChange={(e) => setCfg((c) => ({ ...c, rejBtnAction: e.target.value }))}
              className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:border-primary"
            >
              {REJ_ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {/* iOS 안내 */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              iOS는 알림 버튼을 지원하지 않습니다. 알림 탭 시 상세 화면으로 이동합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60 active:opacity-80"
          >
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : saved
                ? <span>저장됨 ✓</span>
                : <><Save className="w-4 h-4" /> 저장</>}
          </button>
        </div>
      )}
    </div>
  );
}

const STEP_CONFIG: Record<string, { label: string; icon: React.ReactNode; bg: string; border: string; text: string; dot: string }> = {
  individual: {
    label: "개인",
    icon: <User className="w-3.5 h-3.5" />,
    bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-600", dot: "bg-blue-500",
  },
  group: {
    label: "그룹",
    icon: <Users className="w-3.5 h-3.5" />,
    bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-600", dot: "bg-violet-500",
  },
  dept_head: {
    label: "부서장",
    icon: <Building2 className="w-3.5 h-3.5" />,
    bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-600", dot: "bg-orange-500",
  },
};

function stepApproverLabel(step: Step): string {
  if (step.type === "dept_head") return "소속 부서장";
  if (step.members.length === 0) return "승인자 미지정";
  if (step.members.length === 1) return step.members[0].empName;
  return step.members.map(m => m.empName).join(", ");
}

function StepCard({ step, isLast }: { step: Step; isLast: boolean }) {
  const cfg = STEP_CONFIG[step.type] ?? STEP_CONFIG.individual;

  return (
    <div className="flex gap-3">
      {/* 타임라인 선 */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm ${cfg.dot}`}>
          {step.stepNo}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1" style={{ minHeight: 20 }} />}
      </div>

      {/* 카드 */}
      <div className={`flex-1 rounded-xl border ${cfg.border} ${cfg.bg} p-3 mb-3`}>
        {/* 유형 + 이름 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border} mb-1.5`}>
              {cfg.icon}
              {cfg.label}
            </div>
            <p className="text-sm font-bold text-gray-900 leading-snug">
              {stepApproverLabel(step)}
            </p>
          </div>
          {/* 배지들 */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {step.type === "group" && step.threshold > 1 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-violet-200 text-violet-600">
                {step.threshold}명 이상 승인
              </span>
            )}
            {step.allowFinalDecision && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-600">
                <Zap className="w-2.5 h-2.5" />
                전결
              </span>
            )}
            {step.pushEnabled && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-600">
                <Bell className="w-2.5 h-2.5" />
                알림
              </span>
            )}
          </div>
        </div>
        {/* 메시지 */}
        {step.messageTitle && (
          <p className="text-[11px] text-gray-400 mt-2 truncate">
            &ldquo;{step.messageTitle}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

export default function APVMNG03Page() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [pushConfigs, setPushConfigs] = useState<Record<string, PushConfig>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.companyCode) return;
    const companyCode = user.companyCode;

    Promise.all(
      APPROVAL_MENUS.map(async (menu) => {
        const [procRes, cfgRes] = await Promise.all([
          fetch(`/api/approval/process?companyCode=${companyCode}&menuId=${menu.id}`).catch(() => null),
          fetch(`/api/approval/push-config?menuId=${menu.id}`).catch(() => null),
        ]);
        const data    = await procRes?.json().catch(() => null);
        const cfgData = await cfgRes?.json().catch(() => null);
        return {
          proc: {
            menuId:   menu.id,
            menuName: menu.name,
            exists:   data?.exists === true,
            procName: data?.procName ?? "",
            steps:    (data?.steps ?? []) as Step[],
          } satisfies ProcessInfo,
          cfg: (cfgData ?? defaultConfig()) as PushConfig,
        };
      }),
    )
      .then((results) => {
        setProcesses(results.map((r) => r.proc));
        const cfgMap: Record<string, PushConfig> = {};
        results.forEach((r) => { cfgMap[r.proc.menuId] = r.cfg; });
        setPushConfigs(cfgMap);
      })
      .finally(() => setLoading(false));
  }, [user?.companyCode]);

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const toggleMenu = (menuId: string) =>
    setOpenMenus((prev) => ({ ...prev, [menuId]: !prev[menuId] }));

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
      {/* 헤더 */}
      <div className="shrink-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200 -ml-1"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="font-bold text-gray-900 text-base">승인 절차 현황</h1>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
          </div>
        ) : (
          processes.map((proc) => {
            const isOpen = !!openMenus[proc.menuId];
            return (
              <div key={proc.menuId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* 메뉴 헤더 — 클릭하면 접기/펼치기 */}
                <button
                  type="button"
                  onClick={() => toggleMenu(proc.menuId)}
                  className="w-full flex items-center justify-between px-4 pt-4 pb-3 text-left"
                >
                  <div>
                    <p className="font-bold text-gray-900 text-base">{proc.menuName}</p>
                    {proc.procName && proc.procName !== proc.menuName && (
                      <p className="text-xs text-gray-400 mt-0.5">{proc.procName}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {proc.steps.length > 0 ? `총 ${proc.steps.length}단계` : "설정 없음"}
                    </p>
                  </div>
                  {isOpen
                    ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                </button>

                {isOpen && (
                  <>
                    {/* 구분선 */}
                    <div className="mx-4 border-t border-gray-100 mb-4" />

                    {/* 단계 타임라인 */}
                    <div className="px-4 pb-4">
                      {!proc.exists || proc.steps.length === 0 ? (
                        <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          절차가 설정되지 않았습니다
                        </div>
                      ) : (
                        proc.steps.map((step, idx) => (
                          <StepCard
                            key={step.stepNo ?? idx}
                            step={step}
                            isLast={idx === proc.steps.length - 1}
                          />
                        ))
                      )}
                    </div>

                    {/* 푸시 버튼 설정 */}
                    <PushConfigSection
                      menuId={proc.menuId}
                      initial={pushConfigs[proc.menuId] ?? defaultConfig()}
                    />
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
