import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const bodySchema = z.object({
  companyCode: z.string().min(1),
  attCorpCode: z.string().min(1),
  etcName: z.string().min(1),
  etcIdno: z.string().length(13).regex(/^\d{13}$/),
  celNo: z.string().min(1),
  gender: z.enum(["M", "W"]),
  userId: z.string().default("mobileApp"),
});

interface InsertApiResponse {
  Flag?: number | string;
  MSG?: string;
  etc_code?: string;
}

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const b = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(b.companyCode);

  if (resolved.status === "missing_gateway_env") {
    return NextResponse.json({ ok: false, error: "서버 설정 오류입니다." }, { status: 500 });
  }

  if (resolved.status === "fetch_failed") {
    return NextResponse.json({ ok: false, error: "서버에 연결할 수 없습니다." }, { status: 502 });
  }

  if (resolved.status === "invalid_company" || resolved.status === "json_error") {
    return NextResponse.json({ ok: false, error: "유효하지 않은 회사 코드입니다." }, { status: 400 });
  }

  const baseUrl = resolved.baseUrl.replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/R2JsonProc.asp`);
  url.searchParams.set("proc", "usp_mobile_insert_att_etc_info");
  url.searchParams.set("param1", b.attCorpCode);
  url.searchParams.set("param2", b.etcName);
  url.searchParams.set("param3", b.etcIdno);
  url.searchParams.set("param4", b.celNo);
  url.searchParams.set("param5", b.gender);
  url.searchParams.set("param6", b.userId);

  const upstream = await fetch(url.toString(), { cache: "no-store" }).catch(() => null);

  if (!upstream?.ok) {
    return NextResponse.json({ ok: false, error: "일용직 인사정보 등록 서버에 연결할 수 없습니다." }, { status: 502 });
  }

  const data: InsertApiResponse = await upstream.json().catch(() => ({}));

  // 이 프로시저는 성공 시 Flag=1, 실패 시 Flag=-1 반환
  const flag = Number(data.Flag);
  if (flag !== 1) {
    return NextResponse.json({
      ok: false,
      error: data.MSG ?? "일용직 인사정보 등록에 실패했습니다.",
    });
  }

  return NextResponse.json({
    ok: true,
    message: data.MSG ?? "정상 처리되었습니다.",
    etcCode: data.etc_code,
  });
}
