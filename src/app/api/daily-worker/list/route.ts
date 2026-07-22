import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
  corpCode: z.string().optional().default(""),
  etcCode: z.string().optional().default(""),
});

export interface DailyWorkerListApiRow {
  etc_code: string;
  att_corp_code: string;
  etc_name: string;
  cel_no: string | null;
  gender: string;
  etc_idno: string;
}

interface DailyWorkerListApiResponse {
  Flag: string;
  MSG: string;
  items: DailyWorkerListApiRow[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get("companyCode"),
    corpCode: searchParams.get("corpCode") ?? "",
    etcCode: searchParams.get("etcCode") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { companyCode, corpCode, etcCode } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);

  if (resolved.status === "missing_gateway_env") {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 500 });
  }

  if (resolved.status === "fetch_failed") {
    return NextResponse.json({ error: "서버에 연결할 수 없습니다." }, { status: 502 });
  }

  if (resolved.status === "invalid_company" || resolved.status === "json_error") {
    return NextResponse.json({ error: "유효하지 않은 회사 코드입니다." }, { status: 400 });
  }

  const { baseUrl } = resolved;

  const res = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=sp_att_etc_idno_view&param1=${encodeURIComponent(corpCode)}&param2=${encodeURIComponent(etcCode)}`,
    { cache: "no-store" },
  ).catch(() => null);

  if (!res?.ok) {
    return NextResponse.json(
      { error: "일용직 인사정보를 조회하는 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  const data: DailyWorkerListApiResponse = await res.json();

  if (data.Flag === "-1") {
    return NextResponse.json({ items: [] });
  }

  if (data.Flag !== "0") {
    return NextResponse.json(
      { error: data.MSG || "일용직 인사정보를 가져올 수 없습니다." },
      { status: 502 },
    );
  }

  return NextResponse.json({ items: data.items ?? [] });
}
