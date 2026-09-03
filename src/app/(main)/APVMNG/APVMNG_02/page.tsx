"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Settings, Plus, Trash2, X, ChevronDown,
  MessageSquare, Search, Loader2, Check,
} from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

const APPROVAL_MENUS = [
  { id: "LEAVE_01", name: "연차 신청" },
  { id: "EXP_01",   name: "지출 결의" },
];

type StepType = "individual" | "group" | "dept_head";
type ButtonAction = "close" | "reject" | "approve";

interface StepButton { id: string; name: string; action: ButtonAction; }
interface StepMessage { title: string; body: string; buttons: StepButton[]; }
interface StepMember { empCode: string; empName: string; }

interface Step {
  id: string;
  type: StepType;
  members: StepMember[];
  threshold: number;
  messageTitle: string;
  messageBody: string;
}

interface ProcessConfig {
  steps: {
    stepNo: number;
    type: StepType;
    members: StepMember[];
    threshold: number;
    messageTitle: string;
    messageBody: string;
  }[];
  endMessage: StepMessage;
}

const STEP_TYPE_LABELS: Record<StepType, string> = {
  individual: "개인",
  group: "그룹",
  dept_head: "부서장",
};

function makeDefaultStep(menuName: string, stepNo: number): Step {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "individual",
    members: [],
    threshold: 1,
    messageTitle: `${menuName} 승인 요청`,
    messageBody: `{requesterName}님의 ${menuName}을(를) 확인해 주세요.`,
  };
  void stepNo;
}

function makeDefaultEndMessage(menuName: string): StepMessage {
  return {
    title: "처리 완료",
    body: `${menuName} 요청이 최종 승인되었습니다.`,
    buttons: [{ id: "b1", name: "확인", action: "close" }],
  };
}

type EmpRow = { EMP_CODE: string; EMP_NAME: string; DPT_NAME: string };

// ─── 직원 피커 컴포넌트 ──────────────────────────────────────────────────────

function EmpPicker({
  companyCode,
  selected,
  onSelect,
  onClose,
}: {
  companyCode: string;
  selected: StepMember[];
  onSelect: (m: StepMember) => void;
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(kw: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!kw.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/approval/emp-search?companyCode=${companyCode}&keyword=${encodeURIComponent(kw)}`);
        const data = await res.json();
        setResults(data.items ?? []);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  const selectedCodes = new Set(selected.map((m) => m.empCode));

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end" onClick={onClose}>
      <div
        className="bg-white w-full rounded-t-2xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900">직원 검색</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              autoFocus
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); search(e.target.value); }}
              placeholder="이름 또는 사원번호 검색"
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 && keyword && !loading && (
            <p className="text-sm text-gray-400 text-center py-8">검색 결과가 없습니다</p>
          )}
          {results.length === 0 && !keyword && (
            <p className="text-sm text-gray-400 text-center py-8">이름이나 사원번호를 입력하세요</p>
          )}
          {results.map((row) => {
            const isSelected = selectedCodes.has(row.EMP_CODE);
            return (
              <button
                key={row.EMP_CODE}
                onClick={() => onSelect({ empCode: row.EMP_CODE, empName: row.EMP_NAME })}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">{row.EMP_NAME}</p>
                  <p className="text-xs text-gray-400">{row.DPT_NAME} · {row.EMP_CODE}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── 메시지 설정 팝업 ────────────────────────────────────────────────────────

function MsgPopup({
  title: popupTitle,
  msg,
  onClose,
  onChange,
}: {
  title: string;
  msg: StepMessage;
  onClose: () => void;
  onChange: (m: StepMessage) => void;
}) {
  function setMsg(updater: (prev: StepMessage) => StepMessage) {
    onChange(updater(msg));
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end" onClick={onClose}>
      <div
        className="bg-white w-full rounded-t-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900">{popupTitle}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">제목</label>
            <input
              value={msg.title}
              onChange={(e) => setMsg((p) => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">내용</label>
            <textarea
              value={msg.body}
              onChange={(e) => setMsg((p) => ({ ...p, body: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-primary resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              사용 가능 변수: <code className="bg-gray-100 px-1 rounded">{"{requesterName}"}</code>{"  "}<code className="bg-gray-100 px-1 rounded">{"{menuName}"}</code>
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">버튼 구성</label>
              <button
                onClick={() => setMsg((p) => ({ ...p, buttons: [...p.buttons, { id: `b-${Date.now()}`, name: "버튼", action: "close" }] }))}
                className="text-xs text-primary font-semibold"
              >
                + 추가
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {msg.buttons.map((btn) => (
                <div key={btn.id} className="flex items-center gap-2">
                  <input
                    value={btn.name}
                    onChange={(e) => setMsg((p) => ({ ...p, buttons: p.buttons.map((b) => b.id === btn.id ? { ...b, name: e.target.value } : b) }))}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                    placeholder="버튼 이름"
                  />
                  <select
                    value={btn.action}
                    onChange={(e) => setMsg((p) => ({ ...p, buttons: p.buttons.map((b) => b.id === btn.id ? { ...b, action: e.target.value as ButtonAction } : b) }))}
                    className="border border-gray-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:border-primary bg-white"
                  >
                    <option value="close">닫기</option>
                    <option value="reject">반려</option>
                    <option value="approve">승인</option>
                  </select>
                  <button
                    onClick={() => setMsg((p) => ({ ...p, buttons: p.buttons.filter((b) => b.id !== btn.id) }))}
                    disabled={msg.buttons.length === 1}
                    className="w-8 h-8 flex items-center justify-center disabled:opacity-30"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">미리보기</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="font-bold text-gray-900 text-sm mb-1">{msg.title || "제목"}</p>
              <p className="text-xs text-gray-600 mb-3">{msg.body || "내용"}</p>
              <div className="flex gap-2">
                {msg.buttons.map((btn) => (
                  <div key={btn.id} className={`flex-1 py-2 rounded-lg text-xs font-semibold text-center ${btn.action === "approve" ? "bg-primary text-white" : btn.action === "reject" ? "bg-red-500 text-white" : "bg-gray-200 text-gray-700"}`}>
                    {btn.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-6 pt-3 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="w-full bg-primary text-white py-3.5 rounded-xl text-sm font-bold active:opacity-90">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function ApprovalProcessPage() {
  const router = useRouter();
  const companyCode = useAuthStore((s) => s.user?.companyCode ?? '');

  const [selectedMenuId, setSelectedMenuId] = useState(APPROVAL_MENUS[0].id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([makeDefaultStep(APPROVAL_MENUS[0].name, 1)]);
  const [endMessage, setEndMessage] = useState<StepMessage>(makeDefaultEndMessage(APPROVAL_MENUS[0].name));

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  type MsgPopupTarget = { stepId: string } | { stepId: 'end' } | null;
  const [msgPopup, setMsgPopup] = useState<MsgPopupTarget>(null);

  // 직원 피커: { stepId, mode: 'individual' | 'group' } | null
  const [empPicker, setEmpPicker] = useState<{ stepId: string } | null>(null);

  const selectedMenu = APPROVAL_MENUS.find((m) => m.id === selectedMenuId)!;

  // 설정 불러오기
  const loadConfig = useCallback(async (menuId: string) => {
    if (!companyCode) return;
    setLoadingConfig(true);
    try {
      const res = await fetch(`/api/approval/process?companyCode=${companyCode}&menuId=${menuId}`);
      const data = await res.json();
      if (!data.exists || !data.config) return;

      const cfg: ProcessConfig = data.config;
      const menu = APPROVAL_MENUS.find((m) => m.id === menuId)!;
      setSteps(
        cfg.steps.map((s) => ({
          id: `step-${s.stepNo}`,
          type: s.type,
          members: s.members ?? [],
          threshold: s.threshold,
          messageTitle: s.messageTitle ?? makeDefaultStep(menu.name, s.stepNo).messageTitle,
          messageBody: s.messageBody ?? makeDefaultStep(menu.name, s.stepNo).messageBody,
        }))
      );
      if (cfg.endMessage) setEndMessage(cfg.endMessage);
    } finally {
      setLoadingConfig(false);
    }
  }, [companyCode]);

  useEffect(() => { loadConfig(selectedMenuId); }, [selectedMenuId, loadConfig]);

  function handleMenuChange(id: string) {
    const menu = APPROVAL_MENUS.find((m) => m.id === id)!;
    setSelectedMenuId(id);
    setSteps([makeDefaultStep(menu.name, 1)]);
    setEndMessage(makeDefaultEndMessage(menu.name));
    setMenuOpen(false);
    // loadConfig는 selectedMenuId state 변경에 의해 useEffect로 호출
  }

  async function handleSave() {
    if (!companyCode) return;
    setSaving(true);
    setSaveOk(false);
    try {
      const config: ProcessConfig = {
        steps: steps.map((s, i) => ({
          stepNo: i + 1,
          type: s.type,
          members: s.members,
          threshold: s.threshold,
          messageTitle: s.messageTitle,
          messageBody: s.messageBody,
        })),
        endMessage,
      };
      const res = await fetch('/api/approval/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyCode, menuId: selectedMenuId, procName: selectedMenu.name, config }),
      });
      if (res.ok) {
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  function addStep() {
    setSteps((prev) => [...prev, makeDefaultStep(selectedMenu.name, prev.length + 1)]);
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function updateThreshold(id: string, delta: number) {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, threshold: Math.max(1, s.threshold + delta) } : s));
  }

  function addMember(stepId: string, member: StepMember) {
    setSteps((prev) => prev.map((s) => {
      if (s.id !== stepId) return s;
      const already = s.members.some((m) => m.empCode === member.empCode);
      if (already) return { ...s, members: s.members.filter((m) => m.empCode !== member.empCode) };
      return { ...s, members: [...s.members, member] };
    }));
  }

  function removeMember(stepId: string, empCode: string) {
    setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, members: s.members.filter((m) => m.empCode !== empCode) } : s));
  }

  const editingStepForMsg = msgPopup && msgPopup.stepId !== 'end'
    ? steps.find((s) => s.id === msgPopup.stepId)
    : null;

  const msgForPopup: StepMessage | null = msgPopup
    ? msgPopup.stepId === 'end'
      ? endMessage
      : editingStepForMsg
        ? { title: editingStepForMsg.messageTitle, body: editingStepForMsg.messageBody, buttons: [{ id: "b1", name: "닫기", action: "close" }, { id: "b2", name: "반려", action: "reject" }, { id: "b3", name: "승인", action: "approve" }] }
        : null
    : null;

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex-shrink-0 bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">승인 절차 설정</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* 메뉴 선택 */}
        <div className="bg-white border-b border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1.5">승인이 필요한 메뉴</p>
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
                  <button key={m.id} onClick={() => handleMenuChange(m.id)} className={`w-full px-4 py-3 text-sm text-left hover:bg-gray-50 transition-colors ${m.id === selectedMenuId ? "text-primary font-semibold" : "text-gray-900"}`}>
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
          <div className="px-4 py-5 flex flex-col items-stretch gap-0">
            {/* 신청자 */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
              <span className="text-xs font-semibold text-gray-500">● 신청자</span>
            </div>

            {steps.map((step, idx) => (
              <div key={step.id} className="flex flex-col items-center">
                <div className="flex flex-col items-center">
                  <div className="h-5 w-px bg-gray-200" />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {idx + 1}단계
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setMsgPopup({ stepId: step.id })}
                        className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5"
                      >
                        <MessageSquare className="w-3 h-3" />
                        메시지
                      </button>
                      <button
                        onClick={() => removeStep(step.id)}
                        disabled={steps.length === 1}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>

                  {/* 타입 토글 */}
                  <div className="flex gap-1.5">
                    {(["individual", "group", "dept_head"] as StepType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => updateStep(step.id, { type: t, members: [], threshold: 1 })}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${step.type === t ? "bg-primary text-white" : "bg-gray-50 text-gray-600 border border-gray-200"}`}
                      >
                        {STEP_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>

                  {/* 개인 */}
                  {step.type === "individual" && (
                    <div className="flex flex-col gap-2">
                      {step.members.map((m) => (
                        <div key={m.empCode} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                          <span className="text-sm font-medium text-gray-900">{m.empName}</span>
                          <button onClick={() => removeMember(step.id, m.empCode)}>
                            <X className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setEmpPicker({ stepId: step.id })}
                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-primary hover:text-primary transition-colors"
                      >
                        + 승인자 선택
                      </button>
                    </div>
                  )}

                  {/* 그룹 */}
                  {step.type === "group" && (
                    <div className="flex flex-col gap-2.5">
                      {step.members.map((m) => (
                        <div key={m.empCode} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                          <span className="text-sm font-medium text-gray-900">{m.empName}</span>
                          <button onClick={() => removeMember(step.id, m.empCode)}>
                            <X className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setEmpPicker({ stepId: step.id })}
                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-primary hover:text-primary transition-colors"
                      >
                        + 그룹 구성원 추가
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 whitespace-nowrap">최소 승인 수</span>
                        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                          <button onClick={() => updateThreshold(step.id, -1)} className="text-gray-500 font-bold text-base w-4 text-center">−</button>
                          <span className="text-sm font-bold text-gray-900 w-4 text-center">{step.threshold}</span>
                          <button onClick={() => updateThreshold(step.id, 1)} className="text-gray-500 font-bold text-base w-4 text-center">+</button>
                        </div>
                        <span className="text-xs text-gray-500">명 이상</span>
                      </div>
                    </div>
                  )}

                  {/* 부서장 */}
                  {step.type === "dept_head" && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-600">
                      신청자의 소속 부서장이 자동으로 배정됩니다
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 단계 추가 */}
            <div className="flex flex-col items-center">
              <div className="h-5 w-px bg-gray-200" />
            </div>
            <button
              onClick={addStep}
              className="flex items-center justify-center gap-2 w-full py-3.5 border-2 border-dashed border-primary/30 rounded-xl text-sm font-medium text-primary hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              단계 추가
            </button>

            {/* 커넥터 → 종료 */}
            <div className="flex flex-col items-center">
              <div className="h-5 w-px bg-gray-200" />
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">■ 종료</span>
              <button
                onClick={() => setMsgPopup({ stepId: 'end' })}
                className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5"
              >
                <MessageSquare className="w-3 h-3" />
                종료 메시지
              </button>
            </div>
          </div>
        )}

        {/* 저장 버튼 */}
        <div className="px-4 pb-10">
          <button
            onClick={handleSave}
            disabled={saving || loadingConfig}
            className={`w-full py-4 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${saveOk ? 'bg-green-500 text-white' : 'bg-primary text-white active:opacity-90'}`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : saveOk ? '저장 완료 ✓' : '저장'}
          </button>
        </div>
      </div>

      {/* 메시지 설정 팝업 */}
      {msgPopup && msgForPopup && (
        <MsgPopup
          title={msgPopup.stepId === 'end' ? '종료 메시지 설정' : '절차 메시지 설정'}
          msg={msgForPopup}
          onClose={() => setMsgPopup(null)}
          onChange={(m) => {
            if (msgPopup.stepId === 'end') {
              setEndMessage(m);
            } else {
              updateStep(msgPopup.stepId, { messageTitle: m.title, messageBody: m.body });
            }
          }}
        />
      )}

      {/* 직원 피커 */}
      {empPicker && (
        <EmpPicker
          companyCode={companyCode}
          selected={steps.find((s) => s.id === empPicker.stepId)?.members ?? []}
          onSelect={(m) => addMember(empPicker.stepId, m)}
          onClose={() => setEmpPicker(null)}
        />
      )}
    </div>
  );
}
