"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, CheckCircle2, Clock, X, Check, XCircle, Loader2 } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

type ListItem = {
  REQ_ID: number;
  MENU_NAME: string;
  REQ_EMP_NAME: string;
  CURRENT_STEP: number;
  TOTAL_STEPS: number;
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
  steps: { STEP_NO: number; APV_TYPE: string; EMP_CODE: string; EMP_NAME: string; THRESHOLD: number }[];
  actions: { STEP_NO: number; EMP_NAME: string; ACTION: string; COMMENT: string; CREATED_AT: string }[];
};

function payloadToFields(payload: Record<string, unknown>): PayloadField[] {
  return Object.entries(payload).map(([k, v]) => ({ label: k, value: String(v ?? '') }));
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
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
      const res = await fetch(`/api/approval/list?companyCode=${companyCode}&empCode=${empCode}&status=${status}`);
      const data = await res.json();
      if (status === 'PENDING') setPendingItems(data.items ?? []);
      else setCompletedItems(data.items ?? []);
    } finally {
      setListLoading(false);
    }
  }, [companyCode, empCode]);

  useEffect(() => {
    fetchList('PENDING');
    fetchList('APPROVED');
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
      const res = await fetch(`/api/approval/detail?companyCode=${companyCode}&reqId=${reqId}&empCode=${empCode}`);
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
  const isMyStep = detail ? detail.steps.some((s) => s.STEP_NO === detail.currentStep && s.EMP_CODE === empCode) : false;
  const canAct = isPending && isMyStep;

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
              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {item.MENU_NAME}
              </span>
              <span className="text-xs text-gray-400">{formatDate(item.CREATED_AT)}</span>
            </div>
            <p className="font-semibold text-gray-900 text-sm">
              {item.REQ_EMP_NAME}님의 {item.MENU_NAME}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {item.CURRENT_STEP}단계 / {item.TOTAL_STEPS}단계
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
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {item.MENU_NAME}
              </span>
              <span className="text-xs text-gray-400">{formatDate(item.CREATED_AT)}</span>
            </div>
            <p className="font-semibold text-gray-900 text-sm">
              {item.REQ_EMP_NAME}님의 {item.MENU_NAME}
            </p>
            <div className="flex items-center gap-1">
              {item.STATUS === 'APPROVED' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs text-green-500 font-medium">승인 완료</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs text-red-500 font-medium">반려</span>
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

      {/* Detail Popup */}
      {(detailLoading || detail) && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={() => { if (!actionLoading) setDetail(null); }}
        >
          <div
            className="bg-white w-full rounded-t-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : detail && (
              <>
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">{detail.menuName}</p>
                    <h2 className="font-bold text-gray-900">{detail.reqEmpName}님의 {detail.menuName}</h2>
                  </div>
                  <button
                    onClick={() => setDetail(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
                    disabled={actionLoading}
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
                  {/* payload fields */}
                  <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
                    {payloadToFields(detail.payload).map((f) => (
                      <div key={f.label} className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">{f.label}</span>
                        <span className="font-medium text-gray-900">{f.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* 진행 단계 */}
                  <p className="text-xs text-gray-400 text-center">
                    {detail.currentStep}단계 / {detail.totalSteps}단계 진행 중
                  </p>

                  {/* 처리 이력 */}
                  {detail.actions.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold text-gray-500">처리 이력</p>
                      {detail.actions.map((a, i) => (
                        <div key={i} className="flex items-start justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                          <span>{a.STEP_NO}단계 · {a.EMP_NAME} · {a.ACTION === 'APPROVED' ? '승인' : '반려'}</span>
                          <span className="text-gray-400 ml-2 whitespace-nowrap">{formatDate(a.CREATED_AT)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 코멘트 입력 (처리 가능한 경우) */}
                  {canAct && (
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="의견을 입력하세요 (선택)"
                      rows={2}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  )}
                </div>

                <div className="px-4 pb-6 pt-3 border-t border-gray-100 flex gap-2">
                  {canAct ? (
                    <>
                      <button
                        onClick={() => setDetail(null)}
                        disabled={actionLoading}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200"
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
                      className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200"
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
