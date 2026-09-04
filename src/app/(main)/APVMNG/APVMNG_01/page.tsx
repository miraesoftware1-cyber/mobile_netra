"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, CheckCircle2, Clock, X, Check, XCircle, Loader2, RotateCcw } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

type ListItem = {
  REQ_ID: number;
  MENU_NAME: string;
  REQ_EMP_NAME: string;
  CURRENT_STEP: number;
  TOTAL_STEPS: number;
  THRESHOLD: number | null;
  APPROVE_CNT: number;
  APPROVE_NAMES: string;
  STATUS: string;
  CREATED_AT: string;
};

type PayloadField = { label: string; value: string };

type DetailData = {
  reqId: number;
  menuId: string;
  menuName: string;
  reqEmpCode: string;
  reqEmpName: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  createdAt: string;
  payload: Record<string, unknown>;
  procSnapshot: {
    endMessage?: { title?: string; body?: string; buttons?: { id: string; name: string; action: string }[] };
    steps?: { stepNo: number; messageTitle?: string; messageBody?: string }[];
  };
  threshold: number;
  steps: { STEP_NO: number; APV_TYPE: string; EMP_CODE: string; EMP_NAME: string; THRESHOLD: number }[];
  actions: { STEP_NO: number; EMP_CODE: string; EMP_NAME: string; ACTION: string; COMMENT: string; CREATED_AT: string }[];
  userAlreadyActed: boolean;
};

const MENU_LABEL: Record<string, string> = {
  LEAVE_01: '연차/휴가',
  EXP_01:   '지출결의',
  SCH_01:   '일정',
};
function menuLabel(id: string) { return MENU_LABEL[id] ?? id; }

const HIDDEN_PAYLOAD_KEYS = new Set(['_year', '_year_seq', '_emp_code']);

function formatPayloadValue(key: string, value: string): string {
  // 8자리 숫자 → 날짜 포맷
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
  }
  return value;
}

function payloadToFields(payload: Record<string, unknown>): PayloadField[] {
  return Object.entries(payload)
    .filter(([k]) => !HIDDEN_PAYLOAD_KEYS.has(k))
    .map(([k, v]) => ({ label: k, value: formatPayloadValue(k, String(v ?? '')) }));
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000 && d.getDate() === now.getDate()) {
      return `오늘 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.getDate() === yesterday.getDate()) return `어제 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return iso; }
}

function ApprovalInboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyCode = useAuthStore((s) => s.user?.companyCode ?? '');
  const corpCode    = useAuthStore((s) => s.user?.corp_code ?? '');
  const empCode     = useAuthStore((s) => s.user?.emp_code ?? '');
  const empName     = useAuthStore((s) => s.user?.emp_name ?? '');
  const userId      = useAuthStore((s) => s.user?.user_id ?? '');

  const [tab, setTab] = useState<'pending' | 'completed'>('pending');
  const [pendingItems, setPendingItems] = useState<ListItem[]>([]);
  const [completedItems, setCompletedItems] = useState<ListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [comment, setComment] = useState('');

  const fetchList = useCallback(async (status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    if (!companyCode || !empCode) return;
    setListLoading(true);
    try {
      const res = await fetch(`/api/approval/list?companyCode=${companyCode}&empCode=${empCode}&userId=${userId}&status=${status}`);
      const data = await res.json();
      if (status === 'PENDING') setPendingItems(data.items ?? []);
      else setCompletedItems(data.items ?? []);
    } finally {
      setListLoading(false);
    }
  }, [companyCode, empCode, userId]);

  useEffect(() => {
    fetchList('PENDING');
    fetchList('APPROVED'); // list API가 APPROVED+REJECTED+IN_PROGRESS 통합 반환
  }, [fetchList]);

  // 푸쉬 알림 딥링크: ?requestId=...
  useEffect(() => {
    const requestId = searchParams.get('requestId');
    if (requestId && companyCode && empCode) {
      openDetail(Number(requestId));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, companyCode, empCode]);

  async function openDetail(reqId: number) {
    setDetailLoading(true);
    setDetail(null);
    setComment('');
    try {
      const res = await fetch(`/api/approval/detail?companyCode=${companyCode}&reqId=${reqId}&empCode=${empCode}&userId=${userId}`);
      const data = await res.json();
      if (res.ok) setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAction(action: 'APPROVED' | 'REJECTED') {
    if (!detail) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/approval/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyCode,
          corpCode,
          reqId: detail.reqId,
          empCode,
          userId,
          empName,
          action,
          comment,
        }),
      });
      if (res.ok) {
        setDetail(null);
        await fetchList('PENDING');
        await fetchList('APPROVED');
      }
    } finally {
      setActionLoading(false);
    }
  }

  const isPending = detail?.status === 'PENDING';
  const isMyStep = detail ? detail.steps.some((s) => s.STEP_NO === detail.currentStep && (s.EMP_CODE === empCode || s.EMP_CODE === userId)) : false;
  const canAct = isPending && isMyStep && !detail?.userAlreadyActed;

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex-shrink-0 bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">승인 현황</h1>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4">
        <div className="flex">
          {[
            { key: 'pending' as const, label: '대기중', badge: pendingItems.length },
            { key: 'completed' as const, label: '처리완료', badge: 0 },
          ].map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500'
              }`}
            >
              {label}
              {badge > 0 && (
                <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full leading-none">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {listLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {!listLoading && tab === 'pending' && pendingItems.map((item) => (
          <button
            key={item.REQ_ID}
            onClick={() => openDetail(item.REQ_ID)}
            className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left flex flex-col gap-2 active:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              {item.MENU_NAME ? (
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {menuLabel(item.MENU_NAME)}
                </span>
              ) : <span />}
              <span className="text-xs text-gray-400">{formatDate(item.CREATED_AT)}</span>
            </div>
            <p className="font-semibold text-gray-900 text-sm">
              {item.REQ_EMP_NAME}님의 {menuLabel(item.MENU_NAME)} 요청
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {item.CURRENT_STEP}/{item.TOTAL_STEPS}단계
                {item.THRESHOLD != null && item.THRESHOLD > 1 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    item.APPROVE_CNT >= item.THRESHOLD
                      ? 'bg-green-100 text-green-700'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {item.APPROVE_CNT}/{item.THRESHOLD}
                  </span>
                )}
              </span>
              <span className="text-xs text-primary font-medium">상세보기 →</span>
            </div>
          </button>
        ))}

        {!listLoading && tab === 'completed' && completedItems.map((item) => (
          <button
            key={item.REQ_ID}
            onClick={() => openDetail(item.REQ_ID)}
            className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left flex flex-col gap-2 active:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              {item.MENU_NAME ? (
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {menuLabel(item.MENU_NAME)}
                </span>
              ) : <span />}
              <span className="text-xs text-gray-400">{formatDate(item.CREATED_AT)}</span>
            </div>
            <p className="font-semibold text-gray-900 text-sm">
              {item.REQ_EMP_NAME}님의 {menuLabel(item.MENU_NAME)} 요청
            </p>
            <div className="flex items-center gap-1">
              {item.STATUS === 'APPROVED' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs text-green-500 font-medium">승인 완료</span>
                </>
              ) : item.STATUS === 'REJECTED' ? (
                <>
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs text-red-500 font-medium">반려</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-xs text-orange-400 font-medium">다음 단계 진행중</span>
                </>
              )}
            </div>
          </button>
        ))}

        {!listLoading && tab === 'pending' && pendingItems.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <CheckCircle2 className="w-10 h-10 text-gray-200" />
            <p className="text-sm text-gray-400">대기 중인 승인이 없습니다</p>
          </div>
        )}

        {!listLoading && tab === 'completed' && completedItems.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <CheckCircle2 className="w-10 h-10 text-gray-200" />
            <p className="text-sm text-gray-400">처리 완료된 내역이 없습니다</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {(detailLoading || detail) && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          onClick={() => { if (!actionLoading) setDetail(null); }}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl max-h-[85vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : detail && (
              <>
                {/* 헤더 */}
                <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full self-start">
                      {menuLabel(detail.menuName || detail.menuId)}
                    </span>
                    <h2 className="text-base font-bold text-gray-900 mt-1">
                      {detail.reqEmpName}님의 요청
                    </h2>
                    <p className="text-xs text-gray-400">
                      {detail.currentStep}단계 / {detail.totalSteps}단계 진행 중
                    </p>
                  </div>
                  <button
                    onClick={() => setDetail(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 flex-shrink-0 ml-2"
                    disabled={actionLoading}
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
                  {/* payload fields */}
                  <div className="flex flex-col gap-0 divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                    {payloadToFields(detail.payload).map((f) => (
                      <div key={f.label} className="flex items-center justify-between px-4 py-3 bg-white">
                        <span className="text-sm text-gray-500 shrink-0">{f.label}</span>
                        <span className="text-sm font-semibold text-gray-900 text-right ml-4">{f.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* 승인 현황 */}
                  {(detail.actions.length > 0 || (detail.status === 'PENDING' && detail.steps.length > 0)) && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">승인 현황</p>
                      {(() => {
                        // 과거 단계별 actions 그룹핑
                        const actMap = new Map<number, typeof detail.actions>();
                        for (const a of detail.actions) {
                          if (!actMap.has(a.STEP_NO)) actMap.set(a.STEP_NO, []);
                          actMap.get(a.STEP_NO)!.push(a);
                        }
                        // 렌더할 단계 목록: 과거 단계 + 현재 단계
                        const stepNos = Array.from(new Set([
                          ...Array.from(actMap.keys()),
                          detail.currentStep,
                        ])).sort((a, b) => a - b);

                        return stepNos.map((stepNo) => {
                          const acts = actMap.get(stepNo) ?? [];
                          const isCurrentStep = stepNo === detail.currentStep && detail.status === 'PENDING';
                          const approvedCnt = acts.filter(a => a.ACTION === 'APPROVED').length;
                          const comments = acts.filter(a => a.COMMENT);

                          // 현재 PENDING 단계: steps 배열(ERP 승인자 목록) 기준으로 이름+색상 표시
                          const ORDER = { green: 0, red: 1, gray: 2 };
                          const badges = (isCurrentStep && detail.steps.length > 0
                            ? detail.steps.map((s) => {
                                const act = acts.find(a => a.EMP_CODE === s.EMP_CODE);
                                const name = s.EMP_NAME || s.EMP_CODE;
                                if (act?.ACTION === 'APPROVED') return { name, color: 'green' as const, icon: 'check' as const };
                                if (act?.ACTION === 'REJECTED') return { name, color: 'red' as const, icon: 'x' as const };
                                return { name, color: 'gray' as const, icon: 'clock' as const };
                              })
                            : acts.map((a) => ({
                                name: a.EMP_NAME,
                                color: a.ACTION === 'APPROVED' ? 'green' as const : 'red' as const,
                                icon: a.ACTION === 'APPROVED' ? 'check' as const : 'x' as const,
                              }))
                          ).sort((a, b) => ORDER[a.color] - ORDER[b.color]);

                          if (badges.length === 0) return null;

                          return (
                            <div key={stepNo} className="flex flex-col gap-1.5">
                              {detail.totalSteps > 1 && (
                                <span className="text-xs text-gray-400">
                                  {stepNo}단계{isCurrentStep && detail.threshold > 1 ? ` · ${approvedCnt}/${detail.threshold}명` : ''}
                                </span>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {badges.map((b, i) => (
                                  <span key={i} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold ${
                                    b.color === 'green' ? 'bg-green-100 text-green-700'
                                    : b.color === 'red' ? 'bg-red-100 text-red-600'
                                    : 'bg-gray-100 text-gray-400'
                                  }`}>
                                    {b.icon === 'check' ? <Check className="w-3 h-3" />
                                      : b.icon === 'x' ? <XCircle className="w-3 h-3" />
                                      : <Clock className="w-3 h-3" />}
                                    {b.name}
                                  </span>
                                ))}
                              </div>
                              {comments.map((a, i) => (
                                <p key={i} className="text-xs text-gray-500 pl-1">"{a.COMMENT}"</p>
                              ))}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {/* 코멘트 입력 */}
                  {canAct && (
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="의견을 입력하세요 (선택)"
                      rows={2}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  )}
                </div>

                {/* 버튼 */}
                <div className="px-5 pt-3 border-t border-gray-100 flex gap-2" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
                  {canAct ? (
                    <>
                      <button
                        onClick={() => setDetail(null)}
                        disabled={actionLoading}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 active:bg-gray-200"
                      >
                        닫기
                      </button>
                      <button
                        onClick={() => handleAction('REJECTED')}
                        disabled={actionLoading}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold bg-red-500 text-white active:opacity-90 disabled:opacity-50"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '반려'}
                      </button>
                      <button
                        onClick={() => handleAction('APPROVED')}
                        disabled={actionLoading}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold bg-primary text-white active:opacity-90 disabled:opacity-50"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '승인'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDetail(null)}
                      className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 active:bg-gray-200"
                    >
                      닫기
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApprovalInboxPage() {
  return (
    <Suspense>
      <ApprovalInboxContent />
    </Suspense>
  );
}
