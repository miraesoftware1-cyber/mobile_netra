"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2, Save, Bell, Loader2, Play } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

// ── 알림 타입 목록 (코드에서 실제 사용하는 타입) ────────────────
const NOTIFICATION_TYPES: { type: string; label: string }[] = [
  { type: "leave_notify", label: "연차사용 촉진 알림" },
  { type: "general",      label: "일반 알림" },
];

const PRESET_DAYS = [7, 14, 30, 60, 90, 180] as const;

// ── Types ─────────────────────────────────────────────────────

type RuleState = {
  retention_days: number | null;  // null = 삭제 안 함
  custom: boolean;                // 직접 입력 모드
  customValue: string;
};

type ApiRule = {
  type: string;
  retention_days: number | null;
};

// ── Page ──────────────────────────────────────────────────────

export default function NotificationRetentionPage() {
  const router = useRouter();
  const user        = useAuthStore((s) => s.user);
  const companyCode = user?.companyCode ?? "";
  const userId      = user?.user_id     ?? "";

  const [rules, setRules]     = useState<Record<string, RuleState>>({});
  const [counts, setCounts]   = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ deleted: number; at: string } | null>(null);

  const fetchRules = useCallback(async () => {
    if (!companyCode) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/notifications/retention?companyCode=${companyCode}`);
      const data: { rules: Record<string, ApiRule>; counts: Record<string, number> } = await res.json();

      const initial: Record<string, RuleState> = {};
      for (const { type } of NOTIFICATION_TYPES) {
        const saved = data.rules[type];
        initial[type] = {
          retention_days: saved?.retention_days ?? null,
          custom: false,
          customValue: saved?.retention_days != null ? String(saved.retention_days) : "",
        };
      }
      setRules(initial);
      setCounts(data.counts ?? {});
    } catch {
      // 로드 실패 시 기본값
      const initial: Record<string, RuleState> = {};
      for (const { type } of NOTIFICATION_TYPES) {
        initial[type] = { retention_days: null, custom: false, customValue: "" };
      }
      setRules(initial);
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
      const ruleList = NOTIFICATION_TYPES.map(({ type }) => ({
        type,
        retention_days: rules[type]?.retention_days ?? null,
      }));
      await fetch("/api/notifications/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode, userId, rules: ruleList }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    if (!companyCode) return;
    setRunning(true);
    try {
      const res = await fetch("/api/notifications/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode }),
      });
      const data: { deleted?: number } = await res.json();
      setLastResult({
        deleted: data.deleted ?? 0,
        at: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      });
      await fetchRules();
    } finally {
      setRunning(false);
    }
  }

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
            {NOTIFICATION_TYPES.map(({ type, label }) => {
              const rule  = rules[type] ?? { retention_days: null, custom: false, customValue: "" };
              const count = counts[type] ?? 0;

              return (
                <div key={type} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  {/* 타입 헤더 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-primary" />
                      <span className="font-medium text-gray-900 text-sm">{label}</span>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                      현재 {count.toLocaleString()}건
                    </span>
                  </div>

                  {/* 프리셋 버튼 */}
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

                  {/* 직접 입력 */}
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

                  {/* 현재 설정 요약 */}
                  <p className="text-xs text-gray-400">
                    {rule.retention_days != null
                      ? `${rule.retention_days}일이 지난 알림 자동 삭제`
                      : "자동 삭제 없음"}
                  </p>
                </div>
              );
            })}

            {/* 실행 결과 */}
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

      {/* 하단 버튼 */}
      {!loading && (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3 flex gap-2">
          <button
            onClick={handleRunNow}
            disabled={running || saving}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            지금 정리 실행
          </button>
          <button
            onClick={handleSave}
            disabled={saving || running}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            저장
          </button>
        </div>
      )}
    </div>
  );
}
