"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Bell, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { useMenuTitle } from "@/features/menu/use-menu-store";

// ── 상수 ──────────────────────────────────────────────────────────────────────

const APPROVAL_MENUS = [
  { id: "LEAVE_01", name: "연차 신청" },
  { id: "EXP_01",   name: "지출 결의" },
];

const STEP_DEFS = [
  { type: "requester",   label: "담당",   desc: "담당자" },
  { type: "team_leader", label: "팀장",   desc: "신청자 부서의 팀장" },
  { type: "dept_head",   label: "부서장", desc: "신청자 부서의 부서장" },
  { type: "div_head",    label: "본부장", desc: "상위 부서의 부서장" },
  { type: "ceo",         label: "대표",   desc: "회사 대표" },
] as const;

type StepType = typeof STEP_DEFS[number]["type"];

interface StepConfig {
  type: StepType;
  enabled: boolean;
  pushEnabled: boolean;
  messageTitle: string;
  messageBody: string;
}

const STEP_VARIABLES = [
  { label: "{신청자}", value: "{신청자}" },
  { label: "{문서명}", value: "{문서명}" },
  { label: "{기간}",   value: "{기간}" },
  { label: "{일수}",   value: "{일수}" },
  { label: "{단계}",   value: "{단계}" },
];

function makeDefaultSteps(): StepConfig[] {
  return STEP_DEFS.map((def) => ({
    type:         def.type,
    enabled:      false,
    pushEnabled:  true,
    messageTitle: "결재 요청 · {문서명}",
    messageBody:  "{신청자}님의 요청을 검토해 주세요.",
  }));
}

// ── 푸시 설정 화면 ────────────────────────────────────────────────────────────

function PushSettingsScreen({
  step, stepLabel, menuName, onBack, onSave,
}: {
  step: StepConfig; stepLabel: string; menuName: string;
  onBack: () => void;
  onSave: (patch: Pick<StepConfig, "messageTitle" | "messageBody">) => void;
}) {
  const [title, setTitle] = useState(step.messageTitle);
  const [body,  setBody]  = useState(step.messageBody);

  const titleRef  = useRef<HTMLInputElement>(null);
  const bodyRef   = useRef<HTMLTextAreaElement>(null);
  const titleSel  = useRef({ start: 0, end: 0 });
  const bodySel   = useRef({ start: 0, end: 0 });
  const activeField = useRef<"title" | "body">("body");

  function insertVar(v: string) {
    if (activeField.current === "title") {
      const { start, end } = titleSel.current;
      const next = title.slice(0, start) + v + title.slice(end);
      setTitle(next);
      requestAnimationFrame(() => {
        titleRef.current?.focus();
        titleRef.current?.setSelectionRange(start + v.length, start + v.length);
        titleSel.current = { start: start + v.length, end: start + v.length };
      });
    } else {
      const { start, end } = bodySel.current;
      const next = body.slice(0, start) + v + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        bodyRef.current?.focus();
        bodyRef.current?.setSelectionRange(start + v.length, start + v.length);
        bodySel.current = { start: start + v.length, end: start + v.length };
      });
    }
  }

  const previewTitle = title
    .replace("{신청자}", "홍길동").replace("{문서명}", menuName)
    .replace("{기간}", "9/8~9/10").replace("{일수}", "3").replace("{단계}", "1");
  const previewBody = body
    .replace("{신청자}", "홍길동").replace("{문서명}", menuName)
    .replace("{기간}", "9/8~9/10").replace("{일수}", "3").replace("{단계}", "1");

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <header className="flex-shrink-0 bg-white border-b border-gray-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-0.5 text-gray-600">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-base font-bold text-gray-900">푸시 알림 설정</span>
          </button>
          <button onClick={() => onSave({ messageTitle: title, messageBody: body })}
            className="text-sm font-semibold text-primary px-1 py-0.5">저장</button>
        </div>
        <p className="text-xs text-gray-400 mt-0.5 ml-5">{menuName} · {stepLabel}</p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* 미리보기 */}
        <div className="px-4 pt-4 pb-2">
          <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
            <div className="px-4 pt-3.5 pb-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-primary rounded-[4px] flex items-center justify-center flex-shrink-0">
                    <Bell className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-gray-500">미래ERP</span>
                </div>
                <span className="text-xs text-gray-400">지금</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 mb-0.5 leading-snug">{previewTitle || "제목"}</p>
              <p className="text-xs text-gray-500 leading-snug">{previewBody || "내용"}</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 flex flex-col gap-2 pb-10">
          {/* 제목 */}
          <div className="bg-white rounded-xl px-4 py-3.5 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">제목</label>
              <span className="text-xs text-gray-400">{title.length}/40</span>
            </div>
            <input ref={titleRef} value={title} maxLength={40}
              onChange={(e) => setTitle(e.target.value)}
              onSelect={(e) => {
                const el = e.currentTarget;
                titleSel.current = { start: el.selectionStart ?? title.length, end: el.selectionEnd ?? title.length };
              }}
              onFocus={() => { activeField.current = "title"; }}
              className="w-full text-sm text-gray-900 focus:outline-none"
              placeholder="알림 제목을 입력하세요" />
            <p className="text-xs text-gray-400 mt-1.5">권장 20자 이내</p>
          </div>

          {/* 내용 */}
          <div className="bg-white rounded-xl px-4 py-3.5 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">내용</label>
              <span className="text-xs text-gray-400">{body.length}/120</span>
            </div>
            <textarea ref={bodyRef} value={body} maxLength={120} rows={3}
              onChange={(e) => setBody(e.target.value)}
              onSelect={(e) => {
                const el = e.currentTarget;
                bodySel.current = { start: el.selectionStart ?? body.length, end: el.selectionEnd ?? body.length };
              }}
              onFocus={() => { activeField.current = "body"; }}
              className="w-full text-sm text-gray-900 focus:outline-none resize-none"
              placeholder="알림 내용을 입력하세요" />
            <div className="flex items-center gap-1 mt-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-600">개인정보 포함 주의</span>
            </div>
          </div>

          {/* 변수 */}
          <div className="bg-white rounded-xl px-4 py-3.5 border border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2.5">변수 삽입</p>
            <div className="flex flex-wrap gap-2">
              {STEP_VARIABLES.map((v) => (
                <button key={v.value}
                  onMouseDown={(e) => { e.preventDefault(); insertVar(v.value); }}
                  className="px-3 py-1.5 bg-gray-100 active:bg-primary/15 rounded-full text-xs font-medium text-gray-600 transition-colors">
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function ApprovalProcessPage() {
  const router      = useRouter();
  const companyCode = useAuthStore((s) => s.user?.companyCode ?? "");
  const pageTitle   = useMenuTitle("APVMNG_02", "승인 절차 설정");

  const [selectedMenuId, setSelectedMenuId] = useState(APPROVAL_MENUS[0].id);
  const [menuOpen, setMenuOpen]             = useState(false);
  const [steps, setSteps]                   = useState<StepConfig[]>(makeDefaultSteps());
  const [loadingConfig, setLoadingConfig]   = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [saveOk, setSaveOk]                 = useState(false);
  const [saveError, setSaveError]           = useState<string | null>(null);

  // 푸시 설정 화면 전환
  const [pushTarget, setPushTarget] = useState<StepType | null>(null);

  const selectedMenu = APPROVAL_MENUS.find((m) => m.id === selectedMenuId)!;

  const loadConfig = useCallback(async (menuId: string) => {
    setLoadingConfig(true);
    try {
      const res  = await fetch(`/api/approval/process?menuId=${menuId}`);
      const data = await res.json();

      // 저장된 설정으로 steps 초기화
      const fresh = makeDefaultSteps();
      if (data.exists && Array.isArray(data.steps)) {
        for (const saved of data.steps as { type: StepType; pushEnabled: boolean; messageTitle: string; messageBody: string }[]) {
          const idx = fresh.findIndex((s) => s.type === saved.type);
          if (idx >= 0) {
            fresh[idx] = {
              ...fresh[idx],
              enabled:      true,
              pushEnabled:  saved.pushEnabled ?? true,
              messageTitle: saved.messageTitle || fresh[idx].messageTitle,
              messageBody:  saved.messageBody  || fresh[idx].messageBody,
            };
          }
        }
      }
      setSteps(fresh);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => { loadConfig(selectedMenuId); }, [selectedMenuId, loadConfig]);

  function handleMenuChange(id: string) {
    setSelectedMenuId(id);
    setMenuOpen(false);
    setSteps(makeDefaultSteps());
  }

  function toggleStep(type: StepType) {
    setSteps((prev) => prev.map((s) => s.type === type ? { ...s, enabled: !s.enabled } : s));
  }

  function togglePush(type: StepType) {
    setSteps((prev) => prev.map((s) => s.type === type ? { ...s, pushEnabled: !s.pushEnabled } : s));
  }

  function updatePushMsg(type: StepType, patch: Pick<StepConfig, "messageTitle" | "messageBody">) {
    setSteps((prev) => prev.map((s) => s.type === type ? { ...s, ...patch } : s));
  }

  async function handleSave() {
    setSaving(true);
    setSaveOk(false);
    setSaveError(null);
    try {
      // 활성화된 단계만 순서대로 저장
      const enabledSteps = steps
        .filter((s) => s.enabled)
        .map((s, i) => ({
          stepNo:       i + 1,
          type:         s.type,
          pushEnabled:  s.pushEnabled,
          messageTitle: s.messageTitle,
          messageBody:  s.messageBody,
        }));
      const res = await fetch("/api/approval/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuId: selectedMenuId, steps: enabledSteps }),
      });
      if (res.ok) {
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSaveError((errData as { error?: string }).error ?? "저장에 실패했습니다.");
        setTimeout(() => setSaveError(null), 3000);
      }
    } catch {
      setSaveError("네트워크 오류가 발생했습니다.");
      setTimeout(() => setSaveError(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  // ── 푸시 설정 화면 ─────────────────────────────────────────────────────────
  if (pushTarget) {
    const targetStep = steps.find((s) => s.type === pushTarget)!;
    const def = STEP_DEFS.find((d) => d.type === pushTarget)!;
    return (
      <PushSettingsScreen
        step={targetStep}
        stepLabel={def.label}
        menuName={selectedMenu.name}
        onBack={() => setPushTarget(null)}
        onSave={(patch) => { updatePushMsg(pushTarget, patch); setPushTarget(null); }}
      />
    );
  }

  // ── 메인 목록 화면 ─────────────────────────────────────────────────────────
  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      {/* 헤더 */}
      <header className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">{pageTitle}</h1>
          <button
            onClick={handleSave}
            disabled={saving || loadingConfig}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50
              ${saveError ? "bg-red-500 text-white" : saveOk ? "bg-green-500 text-white" : "bg-primary text-white"}`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" />
              : saveError ? "저장 실패" : saveOk ? "저장됨 ✓" : "저장"}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* 메뉴 선택 */}
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)}
              className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium text-gray-900">
              {selectedMenu.name}
              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${menuOpen ? "rotate-90" : ""}`} />
            </button>
            {menuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-20 overflow-hidden">
                {APPROVAL_MENUS.map((m) => (
                  <button key={m.id} onClick={() => handleMenuChange(m.id)}
                    className={`w-full px-4 py-3 text-sm text-left hover:bg-gray-50 ${m.id === selectedMenuId ? "text-primary font-semibold" : "text-gray-900"}`}>
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loadingConfig ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <div className="px-4 pt-4 pb-6 flex flex-col gap-2">
            {/* 설명 */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-2">
              <p className="text-xs text-blue-700 leading-relaxed">
                활성화된 단계 순서대로 승인이 진행됩니다. 승인자는 신청자의 조직도에서 자동으로 찾습니다.
              </p>
            </div>

            {/* 단계 카드 */}
            {steps.map((step, idx) => {
              const def = STEP_DEFS.find((d) => d.type === step.type)!;
              const enabledBefore = steps.slice(0, idx).filter((s) => s.enabled).length;
              return (
                <div key={step.type}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all
                    ${step.enabled ? "border-primary/30" : "border-gray-100 opacity-60"}`}>
                  {/* 단계 헤더 */}
                  <div className="flex items-center gap-3 px-4 py-4">
                    {/* 순번 배지 */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                      ${step.enabled ? "bg-primary text-white" : "bg-gray-100 text-gray-400"}`}>
                      {step.enabled ? enabledBefore + 1 : "-"}
                    </div>

                    {/* 이름 + 설명 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{def.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{def.desc}</p>
                    </div>

                    {/* 토글 */}
                    <button onClick={() => toggleStep(step.type)}
                      className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${step.enabled ? "bg-primary" : "bg-gray-300"}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${step.enabled ? "translate-x-[26px]" : "translate-x-[2px]"}`} />
                    </button>
                  </div>

                  {/* 활성화된 경우: 푸시 설정 옵션 */}
                  {step.enabled && (
                    <>
                      <div className="h-px bg-gray-100 mx-4" />
                      <div className="divide-y divide-gray-100">
                        {/* 푸시 알림 토글 */}
                        <div className="flex items-center justify-between px-4 py-3.5">
                          <span className="text-sm text-gray-700">푸시 알림</span>
                          <button onClick={() => togglePush(step.type)}
                            className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${step.pushEnabled ? "bg-primary" : "bg-gray-300"}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${step.pushEnabled ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
                          </button>
                        </div>
                        {/* 푸시 메시지 설정 */}
                        {step.pushEnabled && (
                          <button className="w-full flex items-center justify-between px-4 py-3.5"
                            onClick={() => setPushTarget(step.type)}>
                            <span className="text-sm text-gray-500 pl-4">알림 메시지 설정</span>
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* 활성화된 단계 없을 때 안내 */}
            {steps.every((s) => !s.enabled) && (
              <p className="text-xs text-center text-gray-400 py-4">
                단계를 하나 이상 활성화해주세요
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
