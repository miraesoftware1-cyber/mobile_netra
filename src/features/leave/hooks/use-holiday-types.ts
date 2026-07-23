"use client";

import { useState, useEffect } from "react";
import { fetchHolidayTypes, type HolidayTypeItem } from "@/features/leave/api";

const CACHE_KEY_PREFIX = "holiday-types-v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

type CacheEntry = {
  companyCode: string;
  items: HolidayTypeItem[];
  cachedAt: number;
};

function readCache(companyCode: string): HolidayTypeItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}:${companyCode}`);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.companyCode !== companyCode) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
    return entry.items;
  } catch {
    return null;
  }
}

function writeCache(companyCode: string, items: HolidayTypeItem[]) {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry = { companyCode, items, cachedAt: Date.now() };
    localStorage.setItem(`${CACHE_KEY_PREFIX}:${companyCode}`, JSON.stringify(entry));
  } catch {
    // localStorage 용량 초과 등 무시
  }
}

export function useHolidayTypes(companyCode: string | undefined) {
  const [items, setItems] = useState<HolidayTypeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!companyCode) {
      setIsLoading(false);
      return;
    }

    // 캐시 히트 → 즉시 반환 후 백그라운드에서 검증하지 않음 (TTL 내라면 신선)
    const cached = readCache(companyCode);
    if (cached) {
      setItems(cached);
      setIsLoading(false);
      return;
    }

    // 캐시 미스 또는 만료 → API 호출
    let cancelled = false;
    setIsLoading(true);
    fetchHolidayTypes(companyCode).then((result) => {
      if (cancelled) return;
      if (result.success) {
        writeCache(companyCode, result.data);
        setItems(result.data);
      }
      setIsLoading(false);
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [companyCode]);

  return { items, isLoading };
}
