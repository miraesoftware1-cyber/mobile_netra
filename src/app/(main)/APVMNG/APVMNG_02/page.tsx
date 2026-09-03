"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Settings, Plus, Trash2, X, ChevronDown, MessageSquare } from "lucide-react";

const APPROVAL_MENUS = [
  { id: "LEAVE_01", name: "연차 신청" },
  { id: "EXP_01", name: "지출 결의" },
];

type StepType = "individual" | "group" | "dept_head";
type ButtonAction = "close" | "reject" | "approve";

interface StepButton {
  id: string;
  name: string;
  action: ButtonAction;
}

interface StepMessage {
  title: string;
  body: string;
  buttons: StepButton[];
}

interface Step {
  id: string;
  type: StepType;
  members: { empCode: string; empName: string }[];
  deptCode?: string;
  threshold: number;
  message: StepMessage;
}

const STEP_TYPE_LABELS: Record<StepType, string> = {
  individual: "개인",
  group: "그룹",
  dept_head: "부서장",
};

function makeDefaultMessage(menuName: string): StepMessage {
  return {
    title: `${menuName} 승인 요청`,
    body: `{requesterName}님의 ${menuName}을(를) 확인해 주세요.`,
    buttons: [
      { id: "b1", name: "닫기", action: "close" },
      { id: "b2", name: "반려", action: "reject" },
      { id: "b3", name: "승인", action: "approve" },
    ],
  };
}

function makeDefaultEndMessage(menuName: string): StepMessage {
  return {
    title: "처리 완료",
    body: `${menuName} 요청이 최종 승인되었습니다.`,
    buttons: [{ id: "b1", name: "확인", action: "close" }],
  };
}

function createStep(menuName: string): Step {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "individual",
    members: [],
    threshold: 1,
    message: makeDefaultMessage(menuName),
  };
}

export default function ApprovalProcessPage() {
  const router = useRouter();
  const [selectedMenuId, setSelectedMenuId] = useState(APPROVAL_MENUS[0].id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([
    createStep(APPROVAL_MENUS[0].name),
  ]);
  const [endMessage, setEndMessage] = useState<StepMessage>(
    makeDefaultEndMessage(APPROVAL_MENUS[0].name)
  );

  // Popup state: which step's message is being edited, null = closed
  type PopupState = { stepId: string } | { stepId: "end" } | null;
  const [msgPopup, setMsgPopup] = useState<PopupState>(null);

  const selectedMenu = APPROVAL_MENUS.find((m) => m.id === selectedMenuId)!;

  function handleMenuChange(id: string) {
    const menu = APPROVAL_MENUS.find((m) => m.id === id)!;
    setSelectedMenuId(id);
    setSteps([createStep(menu.name)]);
    setEndMessage(makeDefaultEndMessage(menu.name));
    setMenuOpen(false);
  }

  function addStep() {
    setSteps((prev) => [...prev, createStep(selectedMenu.name)]);
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  function updateStepType(id: string, type: StepType) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, type, members: [], threshold: 1 } : s))
    );
  }

  function updateThreshold(id: string, delta: number) {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, threshold: Math.max(1, s.threshold + delta) } : s
      )
    );
  }

  // Message being edited
  const editingMsg: StepMessage | null =
    msgPopup === null
      ? null
      : msgPopup.stepId === "end"
      ? endMessage
      : (steps.find((s) => s.id === msgPopup.stepId)?.message ?? null);

  function setEditingMsg(updater: (prev: StepMessage) => StepMessage) {
    if (!msgPopup) return;
    if (msgPopup.stepId === "end") {
      setEndMessage((prev) => updater(prev));
    } else {
      const sid = msgPopup.stepId;
      setSteps((prev) =>
        prev.map((s) => (s.id === sid ? { ...s, message: updater(s.message) } : s))
      );
    }
  }

  function addMsgButton() {
    setEditingMsg((prev) => ({
      ...prev,
      buttons: [
        ...prev.buttons,
        { id: `b-${Date.now()}`, name: "버튼", action: "close" },
      ],
    }));
  }

  function removeMsgButton(btnId: string) {
    setEditingMsg((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((b) => b.id !== btnId),
    }));
  }

  function updateMsgButton(btnId: string, patch: Partial<StepButton>) {
    setEditingMsg((prev) => ({
      ...prev,
      buttons: prev.buttons.map((b) => (b.id === btnId ? { ...b, ...patch } : b)),
    }));
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 flex-shrink-0 bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">승인 절차 설정</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Menu selector */}
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
                  <button
                    key={m.id}
                    onClick={() => handleMenuChange(m.id)}
                    className={`w-full px-4 py-3 text-sm text-left hover:bg-gray-50 transition-colors ${
                      m.id === selectedMenuId ? "text-primary font-semibold" : "text-gray-900"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Flow */}
        <div className="px-4 py-5 flex flex-col items-stretch gap-0">
          {/* Requester */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <span className="text-xs font-semibold text-gray-500">● 신청자</span>
          </div>

          {steps.map((step, idx) => (
            <div key={step.id} className="flex flex-col items-center">
              {/* Connector */}
              <div className="flex flex-col items-center">
                <div className="h-5 w-px bg-gray-200" />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              </div>

              {/* Step card */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full p-4 flex flex-col gap-3">
                {/* Header */}
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

                {/* Type toggle */}
                <div className="flex gap-1.5">
                  {(["individual", "group", "dept_head"] as StepType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateStepType(step.id, t)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        step.type === t
                          ? "bg-primary text-white"
                          : "bg-gray-50 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {STEP_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>

                {/* Type-specific content */}
                {step.type === "individual" && (
                  <button className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-primary hover:text-primary transition-colors">
                    + 승인자 선택
                  </button>
                )}

                {step.type === "group" && (
                  <div className="flex flex-col gap-2.5">
                    <button className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-primary hover:text-primary transition-colors">
                      + 그룹 구성원 추가
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 whitespace-nowrap">최소 승인 수</span>
                      <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <button
                          onClick={() => updateThreshold(step.id, -1)}
                          className="text-gray-500 font-bold text-base w-4 text-center"
                        >
                          −
                        </button>
                        <span className="text-sm font-bold text-gray-900 w-4 text-center">
                          {step.threshold}
                        </span>
                        <button
                          onClick={() => updateThreshold(step.id, 1)}
                          className="text-gray-500 font-bold text-base w-4 text-center"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-xs text-gray-500">명 이상</span>
                    </div>
                  </div>
                )}

                {step.type === "dept_head" && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-600">
                    신청자의 소속 부서장이 자동으로 배정됩니다
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add step */}
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

          {/* Connector to end */}
          <div className="flex flex-col items-center">
            <div className="h-5 w-px bg-gray-200" />
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </div>

          {/* End node */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">■ 종료</span>
            <button
              onClick={() => setMsgPopup({ stepId: "end" })}
              className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5"
            >
              <MessageSquare className="w-3 h-3" />
              종료 메시지
            </button>
          </div>
        </div>

        {/* Save */}
        <div className="px-4 pb-10">
          <button className="w-full bg-primary text-white py-4 rounded-xl text-sm font-bold active:opacity-90">
            저장
          </button>
        </div>
      </div>

      {/* Message Config Popup */}
      {msgPopup && editingMsg && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={() => setMsgPopup(null)}
        >
          <div
            className="bg-white w-full rounded-t-2xl max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900">
                {msgPopup.stepId === "end" ? "종료 메시지 설정" : "절차 메시지 설정"}
              </h2>
              <button
                onClick={() => setMsgPopup(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
              {/* Title */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">제목</label>
                <input
                  value={editingMsg.title}
                  onChange={(e) =>
                    setEditingMsg((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">내용</label>
                <textarea
                  value={editingMsg.body}
                  onChange={(e) =>
                    setEditingMsg((prev) => ({ ...prev, body: e.target.value }))
                  }
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-primary resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  사용 가능 변수: <code className="bg-gray-100 px-1 rounded">{"{requesterName}"}</code>{"  "}<code className="bg-gray-100 px-1 rounded">{"{menuName}"}</code>
                </p>
              </div>

              {/* Buttons */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">버튼 구성</label>
                  <button
                    onClick={addMsgButton}
                    className="text-xs text-primary font-semibold"
                  >
                    + 추가
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {editingMsg.buttons.map((btn) => (
                    <div key={btn.id} className="flex items-center gap-2">
                      <input
                        value={btn.name}
                        onChange={(e) => updateMsgButton(btn.id, { name: e.target.value })}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        placeholder="버튼 이름"
                      />
                      <select
                        value={btn.action}
                        onChange={(e) =>
                          updateMsgButton(btn.id, { action: e.target.value as ButtonAction })
                        }
                        className="border border-gray-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:border-primary bg-white"
                      >
                        <option value="close">닫기</option>
                        <option value="reject">반려</option>
                        <option value="approve">승인</option>
                      </select>
                      <button
                        onClick={() => removeMsgButton(btn.id)}
                        disabled={editingMsg.buttons.length === 1}
                        className="w-8 h-8 flex items-center justify-center disabled:opacity-30"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">미리보기</p>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="font-bold text-gray-900 text-sm mb-1">{editingMsg.title || "제목"}</p>
                  <p className="text-xs text-gray-600 mb-3">{editingMsg.body || "내용"}</p>
                  <div className="flex gap-2">
                    {editingMsg.buttons.map((btn) => (
                      <div
                        key={btn.id}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold text-center ${
                          btn.action === "approve"
                            ? "bg-primary text-white"
                            : btn.action === "reject"
                            ? "bg-red-500 text-white"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {btn.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 pb-6 pt-3 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => setMsgPopup(null)}
                className="w-full bg-primary text-white py-3.5 rounded-xl text-sm font-bold active:opacity-90"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
