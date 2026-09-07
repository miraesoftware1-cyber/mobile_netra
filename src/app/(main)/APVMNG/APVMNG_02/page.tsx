"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Search, Loader2, Check, X, Bell, AlertTriangle, Plus,
} from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

// ── Types ──────────────────────────────────────────────────────────────────

const APPROVAL_MENUS = [
  { id: "LEAVE_01", name: "연차 신청" },
  { id: "EXP_01",   name: "지출 결의" },
];

type StepType = "individual" | "group" | "dept_head";
type AbsenceHandling = "none" | "superior" | "proxy";

interface StepMember { empCode: string; empName: string; }

interface Step {
  id: string;
  type: StepType;
  members: StepMember[];
  threshold: number;
  absenceHandling: AbsenceHandling;
  allowFinalDecision: boolean;
  pushEnabled: boolean;
  useAlertButtons: boolean;
  approveLabel: string;
  rejectLabel: string;
  approveAction: string;
  rejectAction: string;
  messageTitle: string;
  messageBody: string;
}

interface ProcessConfig {
  steps: (Omit<Step, "id"> & { stepNo: number })[];
  endMessage?: { title: string; body: string };
}

const STEP_VARIABLES = [
  { label: "{신청자}", value: "{신청자}" },
  { label: "{부서}",   value: "{부서}" },
  { label: "{문서명}", value: "{문서명}" },
  { label: "{기간}",   value: "{기간}" },
  { label: "{일수}",   value: "{일수}" },
  { label: "{단계}",   value: "{단계}" },
];

const ABSENCE_LABELS: Record<AbsenceHandling, string> = {
  none:     "없음",
  superior: "상위 위임",
  proxy:    "대행자 전달",
};

const STEP_TYPE_LABELS: Record<StepType, string> = {
  individual: "개인",
  group:      "합의",
  dept_head:  "부서장",
};

const APPROVE_ACTIONS = [
  { value: "open_app",   label: "앱 열고 확인" },
  { value: "immediate",  label: "즉시 승인" },
];
const REJECT_ACTIONS = [
  { value: "reason_required", label: "사유 입력 필수" },
  { value: "immediate",       label: "즉시 반려" },
];

type EmpRow = { EMP_CODE: string; EMP_NAME: string; DPT_NAME: string };

function makeDefaultStep(): Step {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "individual",
    members: [],
    threshold: 1,
    absenceHandling: "none",
    allowFinalDecision: false,
    pushEnabled: true,
    useAlertButtons: true,
    approveLabel: "승인",
    rejectLabel: "반려",
    approveAction: "open_app",
    rejectAction: "reason_required",
    messageTitle: "결재 요청 · {문서명}",
    messageBody: "{신청자}({부서}) {일수}일 · {기간}",
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function stepDisplayName(step: Step): string {
  if (step.type === "dept_head") return "소속 부서장";
  if (step.members.length === 0) return "승인자 미지정";
  if (step.members.length === 1) return step.members[0].empName;
  return `${step.members[0].empName} 외 ${step.members.length - 1}명`;
}

function stepSummary(step: Step, stepNo: number): string {
  const parts: string[] = [];
  parts.push(step.type === "group" ? "합의" : "승인");
  if (step.type === "group" && step.members.length > 1)
    parts.push(`${step.threshold}명 승인`);
  if (step.absenceHandling !== "none")
    parts.push(`부재 시 ${ABSENCE_LABELS[step.absenceHandling]}`);
  if (step.pushEnabled) parts.push("푸시");
  void stepNo;
  return parts.join(" · ");
}

// ── EmpPicker ──────────────────────────────────────────────────────────────

function EmpPicker({
  companyCode, mode, selected, onSelect, onClose,
}: {
  companyCode: string;
  mode: "individual" | "group";
  selected: StepMember[];
  onSelect: (m: StepMember) => void;
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [allEmps, setAllEmps] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const qs = mode === "group"
      ? `companyCode=${companyCode}&listType=group`
      : `companyCode=${companyCode}&keyword=`;
    fetch(`/api/approval/emp-search?${qs}`)
      .then((r) => r.json())
      .then((data) => setAllEmps(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyCode, mode]);

  const filtered = keyword.trim()
    ? allEmps.filter((e) => e.EMP_NAME.includes(keyword) || e.EMP_CODE.includes(keyword))
    : allEmps;
  const selectedCodes = new Set(selected.map((m) => m.empCode));

  function handleSelect(row: EmpRow) {
    onSelect({ empCode: row.EMP_CODE, empName: row.EMP_NAME });
    if (mode === "individual") onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl max-h-[72vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900">{mode === "individual" ? "승인자 선택" : "그룹 선택"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input autoFocus value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder="이름 또는 사원번호 검색"
              className="flex-1 bg-transparent text-sm focus:outline-none" />
            {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">검색 결과가 없습니다</p>
          )}
          {filtered.map((row) => {
            const isSelected = selectedCodes.has(row.EMP_CODE);
            return (
              <button key={row.EMP_CODE} onClick={() => handleSelect(row)}
                className={`w-full px-4 py-3 flex items-center justify-between border-b border-gray-100 last:border-0 ${isSelected ? "bg-primary/5" : "hover:bg-gray-50 active:bg-gray-100"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSelected ? "bg-primary text-white" : "bg-gray-100 text-gray-600"}`}>
                    {row.EMP_NAME.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">{row.EMP_NAME}</p>
                    <p className="text-xs text-gray-400">{row.DPT_NAME} · {row.EMP_CODE}</p>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </div>
        {mode === "group" && (
          <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
            <button onClick={onClose} className="w-full py-3 bg-primary text-white rounded-xl text-sm font-bold active:opacity-90">
              완료 {selected.length > 0 ? `(${selected.length}명 선택)` : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Option Picker (generic bottom sheet picker) ────────────────────────────

function OptionPicker<T extends string>({
  title, options, value, onChange, onClose,
}: {
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="pb-8">
          {options.map((opt) => (
            <button key={opt.value} onClick={() => { onChange(opt.value); onClose(); }}
              className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 last:border-0">
              <span className={`text-sm ${opt.value === value ? "font-semibold text-primary" : "text-gray-800"}`}>
                {opt.label}
              </span>
              {opt.value === value && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Push Settings Screen ───────────────────────────────────────────────────

function PushSettingsScreen({
  step, stepNo, menuName, onBack, onSave,
}: {
  step: Step;
  stepNo: number;
  menuName: string;
  onBack: () => void;
  onSave: (patch: Partial<Step>) => void;
}) {
  const [title, setTitle]             = useState(step.messageTitle);
  const [body, setBody]               = useState(step.messageBody);
  const [useButtons, setUseButtons]   = useState(step.useAlertButtons);
  const [approveLabel, setApproveLabel] = useState(step.approveLabel);
  const [rejectLabel, setRejectLabel]   = useState(step.rejectLabel);
  const [approveAction, setApproveAction] = useState(step.approveAction);
  const [rejectAction, setRejectAction]   = useState(step.rejectAction);
  const [approveActionOpen, setApproveActionOpen] = useState(false);
  const [rejectActionOpen, setRejectActionOpen]   = useState(false);

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

  function handleSave() {
    onSave({ messageTitle: title, messageBody: body, useAlertButtons: useButtons, approveLabel, rejectLabel, approveAction, rejectAction });
  }

  const previewTitle = title
    .replace("{신청자}", "홍길동").replace("{부서}", "생산1팀")
    .replace("{문서명}", menuName).replace("{기간}", "9/8~9/10")
    .replace("{일수}", "3").replace("{단계}", String(stepNo));
  const previewBody = body
    .replace("{신청자}", "홍길동").replace("{부서}", "생산1팀")
    .replace("{문서명}", menuName).replace("{기간}", "9/8~9/10")
    .replace("{일수}", "3").replace("{단계}", String(stepNo));

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <header className="flex-shrink-0 bg-white border-b border-gray-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-0.5 text-gray-600">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-base font-bold text-gray-900">푸시 알림 설정</span>
          </button>
          <button onClick={handleSave} className="text-sm font-semibold text-primary px-1 py-0.5">저장</button>
        </div>
        <p className="text-xs text-gray-400 mt-0.5 ml-5">{menuName} · {stepNo}단계</p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Notification preview */}
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
            {useButtons && (
              <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                <div className="flex-1 py-2.5 text-sm font-medium text-primary text-center">{approveLabel || "승인"}</div>
                <div className="flex-1 py-2.5 text-sm font-medium text-red-500 text-center">{rejectLabel || "반려"}</div>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-2 flex flex-col gap-2 pb-10">
          {/* Title */}
          <div className="bg-white rounded-xl px-4 py-3.5 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">제목</label>
              <span className="text-xs text-gray-400">{title.length}/40</span>
            </div>
            <input
              ref={titleRef}
              value={title}
              maxLength={40}
              onChange={(e) => setTitle(e.target.value)}
              onSelect={(e) => {
                const el = e.currentTarget;
                titleSel.current = { start: el.selectionStart ?? title.length, end: el.selectionEnd ?? title.length };
              }}
              onFocus={() => { activeField.current = "title"; }}
              className="w-full text-sm text-gray-900 focus:outline-none"
              placeholder="알림 제목을 입력하세요"
            />
            <p className="text-xs text-gray-400 mt-1.5">권장 20자 이내</p>
          </div>

          {/* Body */}
          <div className="bg-white rounded-xl px-4 py-3.5 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">내용</label>
              <span className="text-xs text-gray-400">{body.length}/120</span>
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              maxLength={120}
              rows={3}
              onChange={(e) => setBody(e.target.value)}
              onSelect={(e) => {
                const el = e.currentTarget;
                bodySel.current = { start: el.selectionStart ?? body.length, end: el.selectionEnd ?? body.length };
              }}
              onFocus={() => { activeField.current = "body"; }}
              className="w-full text-sm text-gray-900 focus:outline-none resize-none"
              placeholder="알림 내용을 입력하세요"
            />
            <div className="flex items-center gap-1 mt-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-600">개인정보 포함 주의</span>
            </div>
          </div>

          {/* Variable chips */}
          <div className="bg-white rounded-xl px-4 py-3.5 border border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2.5">변수 삽입</p>
            <div className="flex flex-wrap gap-2">
              {STEP_VARIABLES.map((v) => (
                <button
                  key={v.value}
                  onMouseDown={(e) => { e.preventDefault(); insertVar(v.value); }}
                  className="px-3 py-1.5 bg-gray-100 active:bg-primary/15 rounded-full text-xs font-medium text-gray-600 transition-colors"
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alert buttons */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-sm font-medium text-gray-900">알림 버튼 사용</span>
              <button
                onClick={() => setUseButtons((v) => !v)}
                className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${useButtons ? "bg-primary" : "bg-gray-300"}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${useButtons ? "translate-x-6.5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {useButtons && (
              <>
                <div className="h-px bg-gray-100" />
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-sm text-gray-700">승인 버튼 라벨</span>
                  <input value={approveLabel} onChange={(e) => setApproveLabel(e.target.value)}
                    className="text-sm text-right text-gray-900 focus:outline-none w-24 bg-transparent"
                    placeholder="승인" />
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-sm text-gray-700">반려 버튼 라벨</span>
                  <input value={rejectLabel} onChange={(e) => setRejectLabel(e.target.value)}
                    className="text-sm text-right text-gray-900 focus:outline-none w-24 bg-transparent"
                    placeholder="반려" />
                </div>
                <div className="h-px bg-gray-100" />
                <button className="w-full flex items-center justify-between px-4 py-3.5" onClick={() => setApproveActionOpen(true)}>
                  <span className="text-sm text-gray-700">승인 버튼 동작</span>
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    {APPROVE_ACTIONS.find((a) => a.value === approveAction)?.label ?? "선택"}
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </span>
                </button>
                <div className="h-px bg-gray-100" />
                <button className="w-full flex items-center justify-between px-4 py-3.5" onClick={() => setRejectActionOpen(true)}>
                  <span className="text-sm text-gray-700">반려 버튼 동작</span>
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    {REJECT_ACTIONS.find((a) => a.value === rejectAction)?.label ?? "선택"}
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </span>
                </button>
              </>
            )}
          </div>

          {useButtons && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                iOS는 알림 버튼을 지원하지 않습니다. 알림 탭 시 상세 화면으로 이동합니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {approveActionOpen && (
        <OptionPicker
          title="승인 버튼 동작"
          options={APPROVE_ACTIONS}
          value={approveAction}
          onChange={setApproveAction}
          onClose={() => setApproveActionOpen(false)}
        />
      )}
      {rejectActionOpen && (
        <OptionPicker
          title="반려 버튼 동작"
          options={REJECT_ACTIONS}
          value={rejectAction}
          onChange={setRejectAction}
          onClose={() => setRejectActionOpen(false)}
        />
      )}
    </div>
  );
}

// ── Step Detail Panel (inline, below step list) ───────────────────────────

function StepDetailPanel({
  step, stepNo,
  onUpdate, onPushSettings, onEmpPicker,
}: {
  step: Step;
  stepNo: number;
  onUpdate: (patch: Partial<Step>) => void;
  onPushSettings: () => void;
  onEmpPicker: () => void;
}) {
  const [typeOpen, setTypeOpen]       = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [threshOpen, setThreshOpen]   = useState(false);

  const thresholdOptions = Array.from({ length: Math.max(step.members.length, 1) }, (_, i) => ({
    value: String(i + 1),
    label: i + 1 === 1 ? "1명만 승인" : `${i + 1}명 이상 승인`,
  }));
  const typeOptions = (["individual", "group", "dept_head"] as StepType[]).map((t) => ({
    value: t, label: STEP_TYPE_LABELS[t],
  }));
  const absenceOptions = (["none", "superior", "proxy"] as AbsenceHandling[]).map((a) => ({
    value: a, label: ABSENCE_LABELS[a],
  }));

  function Row({ label, value, onTap }: { label: string; value: string; onTap?: () => void }) {
    const inner = (
      <div className="flex items-center justify-between px-4 py-3.5">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="flex items-center gap-1 text-sm text-gray-500">
          {value}
          {onTap && <ChevronRight className="w-4 h-4 text-gray-300" />}
        </span>
      </div>
    );
    return onTap ? <button className="w-full text-left" onClick={onTap}>{inner}</button> : <div>{inner}</div>;
  }

  function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="flex items-center justify-between px-4 py-3.5">
        <span className="text-sm text-gray-700">{label}</span>
        <button
          onClick={() => onChange(!value)}
          className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? "bg-primary" : "bg-gray-300"}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${value ? "translate-x-6.5" : "translate-x-0.5"}`} />
        </button>
      </div>
    );
  }

  const approverValue = stepDisplayName(step) || "선택";
  const typeValue     = STEP_TYPE_LABELS[step.type];
  const threshValue   = step.type === "group" && step.members.length > 1
    ? (step.threshold === 1 ? "1명만 승인" : `${step.threshold}명 이상 승인`)
    : null;
  const absenceValue  = ABSENCE_LABELS[step.absenceHandling];

  return (
    <>
      <div className="bg-white rounded-2xl border border-primary/20 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-bold text-gray-800">{stepNo}단계 설정</span>
        </div>

        <div className="divide-y divide-gray-100">
          <Row label="승인자" value={approverValue} onTap={step.type !== "dept_head" ? onEmpPicker : undefined} />
          <Row label="단계 유형" value={typeValue} onTap={() => setTypeOpen(true)} />
          {threshValue !== null && (
            <Row label="복수 승인자" value={threshValue} onTap={() => setThreshOpen(true)} />
          )}
          <Row label="부재 시" value={absenceValue} onTap={() => setAbsenceOpen(true)} />
        </div>

        <div className="h-px bg-gray-100 mx-0" />
        <div className="divide-y divide-gray-100">
          <Toggle label="푸시 알림" value={step.pushEnabled} onChange={(v) => onUpdate({ pushEnabled: v })} />
          {step.pushEnabled && (
            <button className="w-full flex items-center justify-between px-4 py-3.5" onClick={onPushSettings}>
              <span className="text-sm text-gray-500 pl-4">푸시 알림 설정</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          )}
          <Toggle label="전결 허용" value={step.allowFinalDecision} onChange={(v) => onUpdate({ allowFinalDecision: v })} />
        </div>
      </div>

      {typeOpen && (
        <OptionPicker title="단계 유형" options={typeOptions} value={step.type}
          onChange={(v) => { onUpdate({ type: v as StepType, members: [], threshold: 1 }); }}
          onClose={() => setTypeOpen(false)} />
      )}
      {absenceOpen && (
        <OptionPicker title="부재 시" options={absenceOptions} value={step.absenceHandling}
          onChange={(v) => onUpdate({ absenceHandling: v as AbsenceHandling })}
          onClose={() => setAbsenceOpen(false)} />
      )}
      {threshOpen && (
        <OptionPicker title="복수 승인자" options={thresholdOptions} value={String(step.threshold)}
          onChange={(v) => onUpdate({ threshold: Number(v) })}
          onClose={() => setThreshOpen(false)} />
      )}
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ApprovalProcessPage() {
  const router     = useRouter();
  const companyCode = useAuthStore((s) => s.user?.companyCode ?? "");

  const [selectedMenuId, setSelectedMenuId] = useState(APPROVAL_MENUS[0].id);
  const [menuOpen, setMenuOpen]             = useState(false);
  const [steps, setSteps]                   = useState<Step[]>([makeDefaultStep()]);
  const [loadingConfig, setLoadingConfig]   = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [saveOk, setSaveOk]                 = useState(false);
  const [saveError, setSaveError]           = useState<string | null>(null);

  // Navigation
  type ViewState = "list" | "push-settings";
  const [view, setView]                 = useState<ViewState>("list");
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);

  const selectedMenu = APPROVAL_MENUS.find((m) => m.id === selectedMenuId)!;
  const activeStep   = steps.find((s) => s.id === activeStepId);
  const activeStepNo = steps.findIndex((s) => s.id === activeStepId) + 1;

  const loadConfig = useCallback(async (menuId: string) => {
    if (!companyCode) return;
    setLoadingConfig(true);
    try {
      const res  = await fetch(`/api/approval/process?companyCode=${companyCode}&menuId=${menuId}`);
      const data = await res.json();
      if (!data.exists || !data.config) return;
      const cfg: ProcessConfig = data.config;
      setSteps(cfg.steps.map((s) => ({
        id: `step-${s.stepNo}`,
        type:               s.type,
        members:            s.members ?? [],
        threshold:          s.threshold ?? 1,
        absenceHandling:    (s.absenceHandling as AbsenceHandling) ?? "none",
        allowFinalDecision: s.allowFinalDecision ?? false,
        pushEnabled:        s.pushEnabled ?? true,
        useAlertButtons:    s.useAlertButtons ?? true,
        approveLabel:       s.approveLabel ?? "승인",
        rejectLabel:        s.rejectLabel  ?? "반려",
        approveAction:      s.approveAction ?? "open_app",
        rejectAction:       s.rejectAction  ?? "reason_required",
        messageTitle:       s.messageTitle  ?? "결재 요청 · {문서명}",
        messageBody:        s.messageBody   ?? "{신청자}({부서}) {일수}일 · {기간}",
      })));
    } finally {
      setLoadingConfig(false);
    }
  }, [companyCode]);

  useEffect(() => { loadConfig(selectedMenuId); }, [selectedMenuId, loadConfig]);

  function handleMenuChange(id: string) {
    setSelectedMenuId(id);
    setSteps([makeDefaultStep()]);
    setMenuOpen(false);
    setActiveStepId(null);
  }

  async function handleSave() {
    if (!companyCode) return;
    setSaving(true);
    setSaveOk(false);
    setSaveError(null);
    try {
      const config: ProcessConfig = {
        steps: steps.map((s, i) => ({
          stepNo: i + 1,
          type: s.type, members: s.members, threshold: s.threshold,
          absenceHandling: s.absenceHandling, allowFinalDecision: s.allowFinalDecision,
          pushEnabled: s.pushEnabled, useAlertButtons: s.useAlertButtons,
          approveLabel: s.approveLabel, rejectLabel: s.rejectLabel,
          approveAction: s.approveAction, rejectAction: s.rejectAction,
          messageTitle: s.messageTitle, messageBody: s.messageBody,
        })),
      };
      const res = await fetch("/api/approval/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode, menuId: selectedMenuId, procName: selectedMenu.name, config }),
      });
      if (res.ok) {
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSaveError((errData as { error?: string }).error || '저장에 실패했습니다.');
        setTimeout(() => setSaveError(null), 3000);
      }
    } catch {
      setSaveError('네트워크 오류가 발생했습니다.');
      setTimeout(() => setSaveError(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function addStep() {
    setSteps((prev) => [...prev, makeDefaultStep()]);
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    if (activeStepId === id) setActiveStepId(null);
  }

  function moveStep(id: string, dir: -1 | 1) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  function addMember(stepId: string, member: StepMember) {
    setSteps((prev) => prev.map((s) => {
      if (s.id !== stepId) return s;
      if (s.type === "individual") return { ...s, members: [member] };
      const already = s.members.some((m) => m.empCode === member.empCode);
      if (already) return { ...s, members: s.members.filter((m) => m.empCode !== member.empCode) };
      return { ...s, members: [...s.members, member] };
    }));
  }

  // ─ Render push settings screen ─
  if (view === "push-settings" && activeStep) {
    return (
      <PushSettingsScreen
        step={activeStep}
        stepNo={activeStepNo}
        menuName={selectedMenu.name}
        onBack={() => setView("list")}
        onSave={(patch) => { updateStep(activeStep.id, patch); setView("list"); }}
      />
    );
  }

  // ─ Render step list ─
  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">승인 절차 설정</h1>
          <button
            onClick={handleSave}
            disabled={saving || loadingConfig}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${saveError ? "bg-red-500 text-white" : saveOk ? "bg-green-500 text-white" : "bg-primary text-white"}`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveError ? "저장 실패" : saveOk ? "저장됨 ✓" : "저장"}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Menu selector */}
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium text-gray-900"
            >
              {selectedMenu.name}
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
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
            {steps.map((step, idx) => {
              const isActive = step.id === activeStepId;
              return (
                <div
                  key={step.id}
                  className={`w-full bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isActive ? "border-primary/40 shadow-primary/10" : "border-gray-100"}`}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    {/* Step number */}
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{idx + 1}</span>
                    </div>

                    {/* Name + summary — tap area */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setActiveStepId((prev) => prev === step.id ? null : step.id)}
                    >
                      <p className="text-sm font-semibold text-gray-900 truncate">{stepDisplayName(step)}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{stepSummary(step, idx + 1)}</p>
                    </div>

                    {/* Reorder + delete + chevron */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => moveStep(step.id, -1)}
                        disabled={idx === 0}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-20"
                      >
                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => moveStep(step.id, 1)}
                        disabled={idx === steps.length - 1}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-20"
                      >
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => removeStep(step.id)}
                        disabled={steps.length === 1}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 disabled:opacity-20 ml-0.5"
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </button>
                      <div
                        className="w-7 h-7 flex items-center justify-center ml-0.5 cursor-pointer"
                        onClick={() => setActiveStepId((prev) => prev === step.id ? null : step.id)}
                      >
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activeStepId === step.id ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add step */}
            <button
              onClick={addStep}
              className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-primary/30 rounded-2xl text-sm font-medium text-primary hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              단계 추가
            </button>

            {/* Step detail panel — inline below list */}
            {activeStep && (
              <StepDetailPanel
                step={activeStep}
                stepNo={activeStepNo}
                onUpdate={(patch) => updateStep(activeStep.id, patch)}
                onPushSettings={() => setView("push-settings")}
                onEmpPicker={() => setEmpPickerOpen(true)}
              />
            )}
          </div>
        )}
      </div>

      {/* Emp picker */}
      {empPickerOpen && activeStep && (
        <EmpPicker
          companyCode={companyCode}
          mode={activeStep.type === "group" ? "group" : "individual"}
          selected={activeStep.members}
          onSelect={(m) => addMember(activeStep.id, m)}
          onClose={() => setEmpPickerOpen(false)}
        />
      )}
    </div>
  );
}
