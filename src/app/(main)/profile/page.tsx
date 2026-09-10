"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { User, Building2, LogOut, Type, IdCard, Atom, BellOff, Minus, Plus } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { Button } from "@/components/ui/button";
import {
  useFontSizeStore,
  FONT_SIZE_LABELS,
  FONT_SIZE_OPTIONS,
  type FontSize,
} from "@/features/settings/hooks/use-font-size-store";

function Stepper({
  value, unit, min, max,
  onInc, onDec, onType,
}: {
  value: number; unit: string; min: number; max: number;
  onInc: () => void; onDec: () => void;
  onType: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(value).padStart(2, '0');

  return (
    <div className="flex items-center gap-1">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDec}
        className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 shrink-0"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
          setDraft(raw);
          onType(raw);
        }}
        onBlur={() => setDraft(null)}
        className="w-12 text-center text-sm font-bold border border-gray-200 rounded-xl py-1.5 bg-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <span className="text-xs text-gray-400 select-none -ml-0.5">{unit}</span>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onInc}
        className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hStr, mStr] = value.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const fmt = (n: number) => String(n).padStart(2, '0');

  const setH = (newH: number) => onChange(`${fmt(newH)}:${fmt(m)}`);
  const setM = (newM: number) => onChange(`${fmt(h)}:${fmt(newM)}`);

  return (
    <div className="flex items-center gap-3">
      <Stepper
        value={h} unit="시" min={0} max={23}
        onInc={() => setH(h >= 23 ? 0 : h + 1)}
        onDec={() => setH(h <= 0 ? 23 : h - 1)}
        onType={(raw) => {
          const n = parseInt(raw, 10);
          if (!isNaN(n) && n >= 0 && n <= 23) setH(n);
        }}
      />
      <Stepper
        value={m} unit="분" min={0} max={59}
        onInc={() => setM(m >= 50 ? 0 : Math.floor(m / 10) * 10 + 10)}
        onDec={() => setM(m <= 0 ? 50 : (Math.ceil(m / 10) - 1) * 10)}
        onType={(raw) => {
          const n = parseInt(raw, 10);
          if (!isNaN(n) && n >= 0 && n <= 59) setM(n);
        }}
      />
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const fontSize = useFontSizeStore((s) => s.fontSize);
  const setFontSize = useFontSizeStore((s) => s.setFontSize);

  const quietHours    = useAuthStore((s) => s.quietHours);
  const setQuietHours = useAuthStore((s) => s.setQuietHours);

  const [quietEnabled, setQuietEnabled] = useState(quietHours.enabled);
  const [quietStart, setQuietStart]     = useState(quietHours.start);
  const [quietEnd, setQuietEnd]         = useState(quietHours.end);

  // 스토어 값이 바뀌면(로그인 직후 prefetch 완료 시) 동기화
  useEffect(() => {
    setQuietEnabled(quietHours.enabled);
    setQuietStart(quietHours.start);
    setQuietEnd(quietHours.end);
  }, [quietHours]);

  const saveQuietHours = useCallback(async (enabled: boolean, start: string, end: string) => {
    if (!user?.emp_code || !user?.corp_code) return;
    setQuietHours({ enabled, start, end });
    await fetch('/api/push/quiet-hours', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empCode: user.emp_code, userId: user.user_id, corpCode: user.corp_code, enabled, start, end }),
    }).catch(() => {});
  }, [user?.emp_code, user?.corp_code, setQuietHours]);

  const handleLogout = () => {
    logout();
    // 전체 리로드로 JS 상태 완전 초기화 (청크 캐시 문제도 해결)
    window.location.href = "/login";
  };

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">내 정보</h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      {/* 프로필 카드 */}
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full border-2 border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0">
            <IdCard className="w-8 h-8 text-gray-400" />
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 truncate">
                {user?.corp_name ?? "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Atom className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 truncate">
                {user?.dpt_name ?? "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-900 truncate">
                {user?.emp_name ?? "-"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 설정 메뉴 */}
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* 글씨 크기 설정 */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-50">
            <Type className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-gray-700">글씨 크기</span>
            <div className="flex items-center gap-1">
              {FONT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    fontSize === size
                      ? "bg-primary text-white"
                      : "bg-gray-100 text-gray-500 active:bg-gray-200"
                  }`}
                >
                  {FONT_SIZE_LABELS[size]}
                </button>
              ))}
            </div>
          </div>

          {/* 무음 알림 시간대 */}
          <div className="border-b border-gray-50">
            <div className="flex items-center gap-3 px-4 py-4">
              <BellOff className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-700">무음 알림 시간대</span>
              <button
                onClick={() => {
                  const next = !quietEnabled;
                  setQuietEnabled(next);
                  saveQuietHours(next, quietStart, quietEnd);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  quietEnabled ? 'bg-primary' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  quietEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {quietEnabled && (
              <div className="px-4 pb-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-400">시작</span>
                  <TimePicker
                    value={quietStart}
                    onChange={(v) => { setQuietStart(v); saveQuietHours(quietEnabled, v, quietEnd); }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-400">종료</span>
                  <TimePicker
                    value={quietEnd}
                    onChange={(v) => { setQuietEnd(v); saveQuietHours(quietEnabled, quietStart, v); }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 앱 버전 */}
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="text-lg w-5 text-center">📱</span>
            <span className="flex-1 text-sm text-gray-700">앱 버전</span>
            <span className="text-xs text-gray-400">v1.0.0</span>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-4 mb-4">
        <Button
          variant="outline"
          className="w-full h-12 text-red-500 border-red-100 hover:bg-red-50 hover:text-red-600 gap-2"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </Button>
      </div>
      </div>
    </div>
  );
}
