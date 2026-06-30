"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  TicketsPlane,
  NotepadText,
  CalendarCheck,
  CalendarSearch,
  Wallet,
  CalendarDays,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { isDepartmentLeader } from "@/features/auth/lib/is-department-leader";

const MENU_ITEMS = [
  {
    id: 1,
    group: "leave",
    title: "연차/휴가 신청",
    description: "연차/휴가를 신청하세요",
    icon: TicketsPlane,
    href: "/leave/request",
  },
  {
    id: 2,
    group: "leave",
    title: "연차/휴가 승인",
    description: "신청된 연차/휴가를 승인하세요",
    icon: CalendarCheck,
    href: "/leave/approval",
    leaderOnly: true,
  },
  {
    id: 3,
    group: "leave",
    title: "연차/휴가 조회",
    description: "신청한 연차/휴가 내역을 확인하세요",
    icon: NotepadText,
    href: "/leave/history",
  },
  {
    id: 6,
    group: "leave",
    title: "연차/휴가 조회 (부서장)",
    description: "내 부서의 연차/휴가 신청 내역을 조회하세요",
    icon: CalendarSearch,
    href: "/leave/department-history",
    leaderOnly: true,
  },
  {
    id: 4,
    group: "expense",
    title: "지출결의 등록",
    description: "개인카드/현금 지출 결의서를 작성하세요",
    icon: Wallet,
    href: "/expense/request",
  },
  {
    id: 5,
    group: "expense",
    title: "지출결의 조회",
    description: "등록한 지출 결의 내역을 확인하세요",
    icon: NotepadText,
    href: "/expense/history",
  },
] as const;

const MENU_GROUP_LABELS = {
  leave: "연차/휴가",
  expense: "지출결의",
} as const;

const MENU_GROUP_ICONS = {
  leave: CalendarDays,
  expense: Wallet,
} as const;

const MENU_COLLAPSE_STORAGE_KEY = "menu-collapsed-groups";

type MenuGroupKey = keyof typeof MENU_GROUP_LABELS;

export default function MenuPage() {
  const router = useRouter();
  const defaultCollapsedGroups = (Object.keys(MENU_GROUP_LABELS) as MenuGroupKey[]).reduce<
    Partial<Record<MenuGroupKey, boolean>>
  >((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
  const [collapsedGroups, setCollapsedGroups] = useState<
    Partial<Record<MenuGroupKey, boolean>>
  >(defaultCollapsedGroups);
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);
  const leaderFlag = useAuthStore((s) => s.user?.leader_flag);
  const companyName = useAuthStore((s) => s.user?.corp_name);

  useEffect(() => {
    const rawValue = window.localStorage.getItem(MENU_COLLAPSE_STORAGE_KEY);
    if (!rawValue) {
      setIsStorageHydrated(true);
      return;
    }

    try {
      const parsedValue = JSON.parse(rawValue) as Record<string, unknown>;
      const nextValue = (Object.keys(MENU_GROUP_LABELS) as MenuGroupKey[]).reduce<
        Partial<Record<MenuGroupKey, boolean>>
      >((acc, key) => {
        if (typeof parsedValue[key] === "boolean") {
          acc[key] = parsedValue[key] as boolean;
        }
        return acc;
      }, {});
      setCollapsedGroups(nextValue);
    } catch {
      window.localStorage.removeItem(MENU_COLLAPSE_STORAGE_KEY);
    } finally {
      setIsStorageHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    window.localStorage.setItem(
      MENU_COLLAPSE_STORAGE_KEY,
      JSON.stringify(collapsedGroups),
    );
  }, [collapsedGroups, isStorageHydrated]);

  const visibleMenuSections = useMemo(() => {
    const leader = isDepartmentLeader(leaderFlag);
    const filteredItems = MENU_ITEMS.filter((item) => {
      const leaderOk =
        !("leaderOnly" in item && item.leaderOnly) || leader;
      return leaderOk;
    });

    return (Object.keys(MENU_GROUP_LABELS) as MenuGroupKey[])
      .map((group) => ({
        group,
        label: MENU_GROUP_LABELS[group],
        items: filteredItems.filter((item) => item.group === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [leaderFlag]);

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">메뉴</h1>
          </div>
          {companyName ? (
            <span className="max-w-[50%] truncate text-lg font-bold text-gray-400">
              {companyName}
            </span>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="px-4 py-4 flex flex-col gap-3">
          {visibleMenuSections.map((section) => (
            <section
              key={section.group}
              className="flex flex-col gap-3 first:mt-0 mt-3"
            >
              {(() => {
                const GroupIcon = MENU_GROUP_ICONS[section.group];
                return (
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups((prev) => ({
                    ...prev,
                    [section.group]: !prev[section.group],
                  }))
                }
                className="px-1 py-1 flex items-center justify-between text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <GroupIcon className="w-4 h-4 text-gray-900" />
                  {section.label}
                </span>
                {collapsedGroups[section.group] ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                )}
              </button>
                );
              })()}
              {!collapsedGroups[section.group] && section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  className="w-full bg-white rounded-xl border border-gray-100 px-4 py-4 flex items-center gap-4 text-left active:bg-gray-50 transition-colors shadow-sm"
                >
                  <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-6 h-6 text-gray-600" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">
                      {item.title}
                    </span>
                    <span className="text-xs text-gray-400 mt-0.5 truncate">
                      {item.description}
                    </span>
                  </div>
                  <span className="text-gray-300 text-lg">›</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
