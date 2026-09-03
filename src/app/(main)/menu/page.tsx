"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  TicketsPlane,
  NotepadText,
  CalendarCheck,
  CalendarSearch,
  CalendarPlus,
  Wallet,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  HardHat,
  UserPlus,
  CheckCircle2,
  Settings,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { usePushSubscription } from "@/features/push/use-push-subscription";
import { useMenuStore } from "@/features/menu/use-menu-store";
import type { MenuDBItem } from "@/app/api/menu-visibility/route";

// ─── 아이콘 매핑 (DB menu_id 기준) ──────────────────────────────────────────

const MENU_ID_ICON_MAP: Record<string, LucideIcon> = {
  // 연차/휴가 자식
  LEAVE_01: TicketsPlane,
  LEAVE_02: CalendarCheck,
  LEAVE_03: NotepadText,
  LEAVE_04: CalendarSearch,
  // 지출결의 자식
  EXP_01: Wallet,
  EXP_02: NotepadText,
  // 일용직 자식
  DAILY_01: HardHat,
  DAILY_02: UserPlus,
  // 일정관리 자식
  SCH_01: CalendarPlus,
  SCH_02: CalendarSearch,
  // 승인 관리
  APVMNG_01: ClipboardList,
  APVMNG_02: Settings,
};

function menuItemIcon(menuId: string): LucideIcon {
  return MENU_ID_ICON_MAP[menuId] ?? NotepadText;
}

// 부모 그룹 아이콘: menu_id 기준
const GROUP_ICON_MAP: Record<string, LucideIcon> = {
  LEAVE:  CalendarDays,
  EXP:    Wallet,
  DAILY:  HardHat,
  SCH:    CalendarDays,
  APVMNG: CheckCircle2,
};

// DB proc이 부모 항목을 반환하지 않을 때 사용하는 레이블 맵
const PARENT_LABEL_MAP: Record<string, string> = {
  LEAVE:  "연차/휴가",
  EXP:    "지출결의",
  DAILY:  "일용직 인사정보",
  SCH:    "일정관리",
  APVMNG: "승인 관리",
};

function groupIcon(menuId: string): LucideIcon {
  return GROUP_ICON_MAP[menuId] ?? LayoutGrid;
}


// ─── 공통 ────────────────────────────────────────────────────────────────────

const MENU_COLLAPSE_STORAGE_KEY = "menu-collapsed-groups";

type Section = {
  key: string;
  label: string;
  groupIcon: LucideIcon;
  items: { key: string; title: string; icon: LucideIcon; href: string }[];
};

export default function MenuPage() {
  const router = useRouter();
  const companyCode = useAuthStore((s) => s.user?.companyCode ?? "");
  const userId      = useAuthStore((s) => s.user?.user_id ?? "");
  const userType    = useAuthStore((s) => s.user?.user_type ?? "");
  usePushSubscription();
  const companyName = useAuthStore((s) => s.user?.corp_name);

  // 스토어에서 직접 읽어 layout의 visibilitychange 업데이트에 반응
  const storeItems = useMenuStore((s) => s.items);
  const storePerms = useMenuStore((s) => s.perms);
  const setMenuStoreItems = useMenuStore((s) => s.setItems);
  const setMenuStorePerms = useMenuStore((s) => s.setPerms);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);

  useEffect(() => {
    // userId 없으면 API를 부를 수 없으므로 바로 "로드 완료, 빈 목록"으로 처리
    if (!companyCode || !userId) {
      setDbLoaded(true);
      return;
    }
    const params = new URLSearchParams({ companyCode, userId, userType });
    fetch(`/api/menu-visibility?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { items: MenuDBItem[] | null; perms?: Record<string, { view: boolean; add: boolean; edit: boolean; del: boolean; approve: boolean }> }) => {
        const arr = Array.isArray(data.items) ? data.items : [];
        setMenuStoreItems(arr);
        if (data.perms) setMenuStorePerms(data.perms);
        setDbLoaded(true);
      })
      .catch(() => {
        setDbLoaded(true);
      });
  }, [companyCode, userId, userType]);

  useEffect(() => {
    const raw = window.localStorage.getItem(MENU_COLLAPSE_STORAGE_KEY);
    if (raw) {
      try {
        setCollapsedGroups(JSON.parse(raw) as Record<string, boolean>);
      } catch {
        window.localStorage.removeItem(MENU_COLLAPSE_STORAGE_KEY);
      }
    }
    setIsStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!isStorageHydrated) return;
    window.localStorage.setItem(MENU_COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedGroups));
  }, [collapsedGroups, isStorageHydrated]);

  // 승인 관리는 ERP 권한 시스템과 무관하게 항상 표시 (mobile-native feature)
  const STATIC_SECTIONS: Section[] = [
    {
      key: "APVMNG",
      label: "승인 관리",
      groupIcon: CheckCircle2,
      items: [
        { key: "APVMNG_01", title: "승인 현황", icon: ClipboardList, href: "/APVMNG/APVMNG_01" },
        { key: "APVMNG_02", title: "승인 절차 설정", icon: Settings, href: "/APVMNG/APVMNG_02" },
      ],
    },
  ];

  const sections = useMemo((): Section[] => {
    if (!dbLoaded) return [];

    // 소메뉴: DB 권한(per_ret) 기준으로만 체크
    const canView = (menuId: string) => {
      const perm = storePerms[menuId];
      return !perm || perm.view;
    };
    // 대메뉴: 권한 행이 있고 view=false 이면 숨김
    const parentViewable = (menuId: string) => {
      const perm = storePerms[menuId];
      return !perm || perm.view;
    };

    // APVMNG는 STATIC_SECTIONS로 처리 → DB 목록에서 제외
    const dbItems = storeItems.filter((m) => m.menu_id !== "APVMNG" && m.menu_pid !== "APVMNG" && !m.menu_id.startsWith("APVMNG"));
    if (dbItems.length === 0) return [...STATIC_SECTIONS];

    const isParent = (m: MenuDBItem) => !m.menu_pid || m.menu_pid === "NULL";
    const hasParents = dbItems.some(isParent);

    let dbSections: Section[];

    if (hasParents) {
      const parents = dbItems
        .filter(isParent)
        .filter((p) => parentViewable(p.menu_id))
        .sort((a, b) => Number(a.menu_order) - Number(b.menu_order));

      dbSections = parents
        .map((parent) => {
          const children = dbItems
            .filter((m) => !isParent(m) && m.menu_pid === parent.menu_id && canView(m.menu_id))
            .sort((a, b) => Number(a.menu_order) - Number(b.menu_order));
          return {
            key: parent.menu_id,
            label: parent.menu_name,
            groupIcon: groupIcon(parent.menu_id),
            items: children.map((c) => ({
              key: c.menu_id,
              title: c.menu_name,
              icon: menuItemIcon(c.menu_id),
              href: `/${parent.menu_id}/${c.menu_id}`,
            })),
          };
        })
        .filter((s) => s.items.length > 0);
    } else {
      // proc이 자식 항목만 반환하는 경우 → menu_pid로 그룹화
      const pidOrder: string[] = [];
      const grouped = new Map<string, MenuDBItem[]>();
      for (const item of dbItems) {
        const pid = item.menu_pid && item.menu_pid !== "NULL" ? item.menu_pid : null;
        if (!pid || !canView(item.menu_id)) continue;
        if (!parentViewable(pid)) continue;
        if (!grouped.has(pid)) {
          pidOrder.push(pid);
          grouped.set(pid, []);
        }
        grouped.get(pid)!.push(item);
      }
      dbSections = pidOrder
        .map((pid) => ({
          key: pid,
          label: PARENT_LABEL_MAP[pid] ?? pid,
          groupIcon: groupIcon(pid),
          items: (grouped.get(pid) ?? [])
            .sort((a, b) => Number(a.menu_order) - Number(b.menu_order))
            .map((c) => ({
              key: c.menu_id,
              title: c.menu_name,
              icon: menuItemIcon(c.menu_id),
              href: `/${pid}/${c.menu_id}`,
            })),
        }))
        .filter((s) => s.items.length > 0);
    }

    return [...dbSections, ...STATIC_SECTIONS];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeItems, storePerms, dbLoaded]);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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
          {dbLoaded && sections.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <LayoutGrid className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">접근 가능한 메뉴가 없습니다</p>
              <p className="text-xs text-gray-300">관리자에게 권한을 요청하세요</p>
            </div>
          )}
          {sections.map((section) => {
            const GroupIcon = section.groupIcon;
            const collapsed = collapsedGroups[section.key] ?? false;
            return (
              <section key={section.key} className="flex flex-col gap-3 first:mt-0 mt-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(section.key)}
                  className="px-1 py-1 flex items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <GroupIcon className="w-4 h-4 text-gray-900" />
                    {section.label}
                  </span>
                  {collapsed ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {!collapsed && section.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => router.push(item.href)}
                      className="w-full bg-white rounded-xl border border-gray-100 px-4 py-4 flex items-center gap-4 text-left active:bg-gray-50 transition-colors shadow-sm"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                        <ItemIcon className="w-6 h-6 text-gray-600" />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-semibold text-gray-900 text-sm">
                          {item.title}
                        </span>
                      </div>
                      <span className="text-gray-300 text-lg">›</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
