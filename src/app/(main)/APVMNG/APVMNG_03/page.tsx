"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, AlertCircle, Users, User, Building2, Zap, Bell } from "lucide-react";
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
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">
                <Bell className="w-2.5 h-2.5" />
                푸시
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.companyCode) return;
    const companyCode = user.companyCode;

    Promise.all(
      APPROVAL_MENUS.map(async (menu) => {
        const res = await fetch(
          `/api/approval/process?companyCode=${companyCode}&menuId=${menu.id}`,
        ).catch(() => null);
        const data = await res?.json().catch(() => null);
        return {
          menuId:   menu.id,
          menuName: menu.name,
          exists:   data?.exists === true,
          procName: data?.procName ?? "",
          steps:    (data?.config?.steps ?? []) as Step[],
        } satisfies ProcessInfo;
      }),
    )
      .then(setProcesses)
      .finally(() => setLoading(false));
  }, [user?.companyCode]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
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

      <div className="px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
          </div>
        ) : (
          processes.map((proc) => (
            <div key={proc.menuId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* 메뉴 헤더 */}
              <div className="px-4 pt-4 pb-3">
                <p className="font-bold text-gray-900 text-base">{proc.menuName}</p>
                {proc.procName && proc.procName !== proc.menuName && (
                  <p className="text-xs text-gray-400 mt-0.5">{proc.procName}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {proc.steps.length > 0 ? `총 ${proc.steps.length}단계` : "설정 없음"}
                </p>
              </div>

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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
