import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
  userId: z.string().min(1),
  userType: z.string().optional(),
});

export interface MenuDBItem {
  menu_id: string;
  menu_pid: string | null;
  menu_name: string;
  menu_exec: string;
  menu_order: number;
  use_yn?: string;
}

interface MenuApiResponse {
  Flag: string;
  MSG: string;
  items: MenuDBItem[];
}

interface PermissionApiResponse {
  Flag: string;
  MSG: string;
  items: Record<string, unknown>[];
}

export interface MenuPerm {
  view: boolean;
  add: boolean;
  edit: boolean;
  del: boolean;
  approve: boolean;
}

function yn(v: unknown): boolean { return v === "Y" || v === "y"; }

// ERP 응답 필드명 대소문자 무관하게 처리 (PER_RET / per_ret 모두 대응)
function normRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = v;
  return out;
}

function rowToPerm(raw: Record<string, unknown>): MenuPerm {
  const r = normRow(raw);
  const hasCrud = "per_ret" in r || "per_ins" in r || "per_mod" in r || "per_del" in r;
  if (!hasCrud) return { view: true, add: true, edit: true, del: true, approve: true };
  return {
    view: yn(r.per_ret),
    add: yn(r.per_ins),
    edit: yn(r.per_mod),
    del: yn(r.per_del),
    approve: yn(r.per_apv),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get("companyCode"),
    userId: searchParams.get("userId"),
    userType: searchParams.get("userType") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ items: null });
  }

  const { companyCode, userId, userType } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== "ok") {
    return NextResponse.json({ items: null });
  }

  const { baseUrl } = resolved;

  // 1. 메뉴 목록 + 권한 병렬 조회 (시스템관리자는 권한 조회 불필요)
  const menuFetch = fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_env_mobile_menu&param1=`,
    { cache: "no-store" },
  ).catch(() => null);

  const permFetch = userType !== "S"
    ? fetch(
        `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_env_mobile_permission&param1=${encodeURIComponent(userId)}`,
        { cache: "no-store" },
      ).catch(() => null)
    : Promise.resolve(null);

  const [menuRes, permRes] = await Promise.all([menuFetch, permFetch]);

  if (!menuRes?.ok) return NextResponse.json({ items: null });

  const menuData: MenuApiResponse = await menuRes.json().catch(() => null);
  if (!menuData || menuData.Flag !== "0" || !menuData.items?.length) {
    return NextResponse.json({ items: null });
  }

  // 필드명 대소문자 정규화 (proc이 대문자로 반환하는 경우 대응)
  menuData.items = (menuData.items as unknown as Record<string, unknown>[]).map((raw) => {
    const r = normRow(raw);
    return {
      menu_id:    String(r.menu_id ?? ""),
      menu_pid:   r.menu_pid != null && r.menu_pid !== "NULL" ? String(r.menu_pid) : null,
      menu_name:  String(r.menu_name ?? ""),
      menu_exec:  String(r.menu_exec ?? ""),
      menu_order: Number(r.menu_order ?? 99),
      use_yn:     r.use_yn != null ? String(r.use_yn) : undefined,
    } as MenuDBItem;
  });

  // use_yn = Y 인 메뉴만 사용
  menuData.items = menuData.items.filter(
    (m) => !m.use_yn || m.use_yn.toUpperCase() === "Y",
  );

  // 시스템관리자(user_type=S)는 모든 메뉴 풀 권한
  if (userType === "S") {
    const fullPerms: Record<string, MenuPerm> = {};
    for (const m of menuData.items) {
      fullPerms[m.menu_id] = { view: true, add: true, edit: true, del: true, approve: true };
    }
    return NextResponse.json({ items: menuData.items, perms: fullPerms });
  }

  // 네트워크 자체가 끊긴 경우에만 null 반환 (프론트에서 서버 오류 안내)
  if (!permRes?.ok) return NextResponse.json({ items: null });

  const permData: PermissionApiResponse = await permRes.json().catch(() => null);
  if (!permData) return NextResponse.json({ items: null });

  // Flag 값에 관계없이 허가된 menu_id 집합만 뽑는다.
  // Flag != 0(데이터 없음/오류)이면 items가 없거나 비어 있으므로 결과적으로 빈 배열이 된다.
  const permRows = (permData.items ?? []).map(normRow);

  const perms: Record<string, MenuPerm> = {};
  for (const row of permRows) {
    const menuId = row.menu_id as string;
    if (menuId) perms[menuId] = rowToPerm(row);
  }

  // proc은 per_ret=N 인 행을 반환하지 않는다.
  // 따라서 "자식은 permRows에 있는데 부모는 없는" 경우 = 부모가 명시적으로 N으로 설정된 것.
  // 이 경우 부모를 view=false 로 perms에 추가해 자식도 숨긴다.
  const menuItemById = new Map(menuData.items.map((m) => [m.menu_id, m]));
  const parentIdsWithChildren = new Set<string>();
  for (const row of permRows) {
    const menuId = row.menu_id as string;
    if (!menuId) continue;
    const item = menuItemById.get(menuId);
    const pid = item?.menu_pid && item.menu_pid !== "NULL" ? item.menu_pid : null;
    if (pid) parentIdsWithChildren.add(pid);
  }
  // 자식이 권한 시스템에 있는데 부모 자신은 반환되지 않은 경우 → 부모 N
  for (const pid of parentIdsWithChildren) {
    if (!perms[pid]) {
      perms[pid] = { view: false, add: false, edit: false, del: false, approve: false };
    }
  }

  // per_ret = Y 인 메뉴만 포함 (권한 행 자체가 없는 메뉴도 제외)
  // 부모(대메뉴)가 메뉴 테이블에 존재하는데 권한이 없으면 자식(소메뉴)도 제외
  const allMenuIds = new Set(menuData.items.map((m) => m.menu_id));
  const visibleIds = new Set(
    menuData.items
      .filter((m) => perms[m.menu_id]?.view === true)
      .map((m) => m.menu_id),
  );

  const filteredItems = menuData.items.filter((m) => {
    if (!visibleIds.has(m.menu_id)) return false;
    // 소메뉴: 부모가 메뉴 테이블에 있다면 부모도 visible해야 함
    const pid = m.menu_pid && m.menu_pid !== "NULL" ? m.menu_pid : null;
    if (pid && allMenuIds.has(pid) && !visibleIds.has(pid)) return false;
    // 부모가 perms에 view=false 로 추가된 경우 (proc이 N이라 반환 안 한 경우)
    if (pid && perms[pid] && !perms[pid].view) return false;
    return true;
  });

  return NextResponse.json({ items: filteredItems, perms });
}
