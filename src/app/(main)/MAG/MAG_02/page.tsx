"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2, Save, Bell, Loader2, Play, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

// 알려진 타입 레이블 (DB에 없는 타입은 type 문자열 그대로 표시)
const KNOWN_LABELS: Record<string, string> = {
  leave_notify: "연차사용 촉진 알림",
  general:      "일반 알림",
};

function typeLabel(type: string) {
  return KNOWN_LABELS[type] ?? type;
}

const PRESET_DAYS = [7, 14, 30, 60, 90, 180] as const;

// ── Types ─────────────────────────────────────────────────────

type RuleState = {
  retention_days: number | null;
  custom: boolean;
  customValue: string;
};

type ApiRule = {
  type: string;
  retention_days: number | null;
};

type PreviewTarget = { type: string; count: number };

// ── Page ──────────────────────────────────────────────────────

export default function NotificationRetentionPage() {
  const router = useRouter();
  const user        = useAuthStore((s) => s.user);
  const companyCode = user?.companyCode ?? "";
  const userId      = user?.user_id     ?? "";

  const [types, setTypes]     = useState<string[]>([]);
  const [rules, setRules]     = useState<Record<string, RuleState>>({});
  const [counts, setCounts]   = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [lastResult, setLastResult] = useState<{ deleted: number; at: string } | null>(null);

  // 확인 팝업
  const [previewing, setPreviewing]   = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewTargets, setPreviewTargets] = useState<PreviewTarget[]>([]);
  const [deleting, setDeleting] = useState(false);

  const fetchRules = useCallback(async () => {
    if (!companyCode) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/notifications/retention?companyCode=${companyCode}`);
      const data: { rules: Record<string, ApiRule>; counts: Record<string, number>; types: string[] } = await res.json();

      const dynamicTypes = data.types ?? [];
      const initial: Record<string, RuleState> = {};
      for (const type of dynamicTypes) {
        const saved = data.rules[type];
        initial[type] = {
          retention_days: saved?.retention_days ?? null,
          custom: false,
          customValue: saved?.retention_days != null ? String(saved.retention_days) : "",
        };
      }
      setTypes(dynamicTypes);
      setRules(initial);
      setCounts(data.counts ?? {});
    } catch {
      setTypes([]);
      setRules({});
    } finally {
      setLoading(false);
    }
  }, [companyCode]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function setPreset(type: string, days: number | null) {
    setRules((prev) => ({
      ...prev,
      [type]: { retention_days: days, custom: false, customValue: days != null ? String(days) : "" },
    }));
  }

  function toggleCustom(type: string) {
    setRules((prev) => ({
      ...prev,
      [type]: { ...prev[type], custom: true, customValue: prev[type].retention_days != null ? String(prev[type].retention_days) : "" },
    }));
  }

  function setCustomValue(type: string, val: string) {
    const days = val === "" ? null : Math.max(1, parseInt(val, 10) || 1);
    setRules((prev) => ({
      ...prev,
      [type]: { ...prev[type], customValue: val, retention_days: days },
    }));
  }

  async function handleSave() {
    if (!companyCode || !userId) return;
    setSaving(true);
    try {
      const ruleList = types.map((type) => ({
        type,
        retention_days: rules[type]?.retention_days ?? null,
      }));
      await fetch("/api/notifications/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode, userId, rules: ruleList }),
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  // 1단계: 미리 보기 조회 후 팝업
  async function handleRunNowClick() {
    if (!companyCode) return;
    setPreviewing(true);
    try {
      const res = await fetch("/api/notifications/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode, preview: true }),
      });
      const data: { targets?: PreviewTarget[] } = await res.json();
      setPreviewTargets(data.targets ?? []);
      setConfirmOpen(true);
    } finally {
      setPreviewing(false);
    }
  }

  // 2단계: 팝업 확인 후 실제 삭제
  async function handleConfirmDelete() {
    if (!companyCode) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/notifications/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode, preview: false }),
      });
      const data: { deleted?: number } = await res.json();
      setLastResult({
        deleted: data.deleted ?? 0,
        at: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      });
      setConfirmOpen(false);
      await fetchRules();
    } finally {
      setDeleting(false);
    }
  }

  const totalPreview = previewTargets.reduce((s, t) => s + t.count, 0);

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
        <h1 className="font-semibold text-gray-900 text-base flex-1">알림 삭제 주기 관리</h1>
      </header>

      {/* 안내 */}
      <div className="shrink-0 px-4 py-3 bg-blue-50 border-b border-blue-100">
        <p className="text-xs text-blue-600 leading-relaxed">
          설정한 보존 기간이 지난 알림은 매일 새벽 2시에 자동 삭제됩니다. 관리자가 설정하면 전체 사용자에게 적용됩니다.
        </p>
      </div>

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-4 pb-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <>
            {types.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Bell className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">쌓인 알림이 없습니다</p>
              </div>
            )}

            {types.map((type) => {
              const label = typeLabel(type);
              const rule  = rules[type] ?? { retention_days: null, custom: false, customValue: "" };
              const count = counts[type] ?? 0;

              return (
                <div key={type} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-primary" />
                      <span className="font-medium text-gray-900 text-sm">{label}</span>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                      현재 {count.toLocaleString()}건
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_DAYS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setPreset(type, d)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          !rule.custom && rule.retention_days === d
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-gray-600 border-gray-200 hover:border-primary/40"
                        }`}
                      >
                        {d}일
                      </button>
                    ))}
                    <button
                      onClick={() => toggleCustom(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        rule.custom
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-gray-600 border-gray-200 hover:border-primary/40"
                      }`}
                    >
                      직접 입력
                    </button>
                    <button
                      onClick={() => setPreset(type, null)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        !rule.custom && rule.retention_days === null
                          ? "bg-gray-700 text-white border-gray-700"
                          : "bg-white text-gray-400 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      삭제 안 함
                    </button>
                  </div>

                  {rule.custom && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={rule.customValue}
                        onChange={(e) => setCustomValue(type, e.target.value)}
                        placeholder="일수 입력"
                        className="w-28 h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary/50"
                      />
                      <span className="text-sm text-gray-500">일 후 삭제</span>
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    {rule.retention_days != null
                      ? `${rule.retention_days}일이 지난 알림 자동 삭제`
                      : "자동 삭제 없음"}
                  </p>
                </div>
              );
            })}

            {lastResult && (
              <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-green-500 shrink-0" />
                <p className="text-sm text-green-700">
                  {lastResult.at} 정리 완료 —{" "}
                  <span className="font-semibold">{lastResult.deleted.toLocaleString()}건</span> 삭제
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* 하단 버튼 — 항상 렌더링해서 iOS flex 레이아웃 안정화 */}
      <div className={`shrink-0 border-t border-gray-100 bg-white px-4 py-3 flex gap-2 ${loading ? "invisible" : ""}`}>
        <button
          onClick={handleRunNowClick}
          disabled={loading || previewing || saving || deleting}
          className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium disabled:opacity-50"
        >
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          지금 정리 실행
        </button>
        <button
          onClick={handleSave}
          disabled={loading || saving || previewing || deleting}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          저장
        </button>
      </div>

      {/* 저장 완료 토스트 */}
      {savedToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          저장되었습니다.
        </div>
      )}

      {/* 삭제 확인 팝업 */}
      {confirmOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => !deleting && setConfirmOpen(false)} />
          <div className="fixed inset-x-8 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-center font-semibold text-gray-900 mb-1">알림 정리 실행</h3>

            {totalPreview === 0 ? (
              <p className="text-center text-sm text-gray-500 mt-2 mb-6">삭제할 알림이 없습니다.</p>
            ) : (
              <>
                <p className="text-center text-sm text-gray-500 mb-3">다음 알림이 삭제됩니다.</p>
                <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 space-y-1.5">
                  {previewTargets.map((t) => (
                    <div key={t.type} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{typeLabel(t.type)}</span>
                      <span className="font-semibold text-red-500">{t.count.toLocaleString()}건</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-1.5 flex items-center justify-between text-sm font-semibold">
                    <span className="text-gray-700">합계</span>
                    <span className="text-red-500">{totalPreview.toLocaleString()}건</span>
                  </div>
                </div>
                <p className="text-center text-xs text-gray-400 mb-6">삭제된 알림은 복구할 수 없습니다.</p>
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 font-medium disabled:opacity-50"
              >
                취소
              </button>
              {totalPreview > 0 && (
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  삭제
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
