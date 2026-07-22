import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
});

interface DailyWorkerNameApiRow {
  etc_code: string;
  etc_name: string;
}

interface DailyWorkerNameApiResponse {
  Flag: string;
  MSG: string;
  items: DailyWorkerNameApiRow[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get("companyCode"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { companyCode } = parsed.data;

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
    `${baseUrl}/R2JsonProc.asp?proc=sp_att_etc_idno_view&param1=&param2=`,
    { cache: "no-store" },
  ).catch(() => null);

  if (!res?.ok) {
    return NextResponse.json(
      { error: "일용직 성명 목록을 조회하는 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  const data: DailyWorkerNameApiResponse = await res.json();

  if (data.Flag === "-1") {
    return NextResponse.json({ items: [] });
  }

  if (data.Flag !== "0") {
    return NextResponse.json(
      { error: data.MSG || "성명 목록을 가져올 수 없습니다." },
      { status: 502 },
    );
  }

  const items = (data.items ?? []).map((row) => ({
    etc_code: row.etc_code,
    etc_name: row.etc_name,
  }));

  return NextResponse.json({ items });
}
