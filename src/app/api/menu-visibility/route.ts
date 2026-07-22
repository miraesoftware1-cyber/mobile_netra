import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
  userId: z.string().min(1),
});

export interface MenuDBItem {
  menu_id: string;
  menu_pid: string | null;
  menu_name: string;
  menu_exec: string;
  menu_order: number;
}

interface MenuApiResponse {
  Flag: string;
  MSG: string;
  items: MenuDBItem[];
}

interface PermissionRow {
  menu_id: string;
}

interface PermissionApiResponse {
  Flag: string;
  MSG: string;
  items: PermissionRow[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get("companyCode"),
    userId: searchParams.get("userId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ items: null });
  }

  const { companyCode, userId } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== "ok") {
    return NextResponse.json({ items: null });
  }

  const { baseUrl } = resolved;

  // 1. 활성화된 메뉴 목록 조회
  const menuRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_env_mobile_menu&param1=`,
    { cache: "no-store" },
  ).catch(() => null);

  if (!menuRes?.ok) return NextResponse.json({ items: null });

  const menuData: MenuApiResponse = await menuRes.json().catch(() => null);
  if (!menuData || menuData.Flag !== "0" || !menuData.items?.length) {
    return NextResponse.json({ items: null });
  }

  // 2. 사용자 권한 조회
  const permRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_env_mobile_permission&param1=${encodeURIComponent(userId)}`,
    { cache: "no-store" },
  ).catch(() => null);

  // 네트워크 자체가 끊긴 경우에만 null 반환 (프론트에서 서버 오류 안내)
  if (!permRes?.ok) return NextResponse.json({ items: null });

  const permData: PermissionApiResponse = await permRes.json().catch(() => null);
  if (!permData) return NextResponse.json({ items: null });

  // Flag 값에 관계없이 허가된 menu_id 집합만 뽑는다.
  // Flag != 0(데이터 없음/오류)이면 items가 없거나 비어 있으므로 결과적으로 빈 배열이 된다.
  const permittedIds = new Set((permData.items ?? []).map((r) => r.menu_id));
  const filteredItems = menuData.items.filter((m) => permittedIds.has(m.menu_id));

  return NextResponse.json({ items: filteredItems });
}
