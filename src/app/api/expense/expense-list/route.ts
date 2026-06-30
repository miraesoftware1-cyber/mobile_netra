import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
  empCode: z.string().min(1),
  yearMonth: z.string().regex(/^\d{6}$/, "기준연월은 YYYYMM 형식이어야 합니다."),
});

interface ExpenseListApiRow {
  sch_date: string;
  bslip_name: string;
  bslip_sum: number;
  slip_type: string;
  cst_name: string;
}

interface ExpenseListApiResponse {
  Flag: string;
  MSG: string;
  items: ExpenseListApiRow[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get("companyCode"),
    empCode: searchParams.get("empCode"),
    yearMonth: searchParams.get("yearMonth"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { companyCode, empCode, yearMonth } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);

  if (resolved.status === "missing_gateway_env") {
    return NextResponse.json(
      { error: "서버 설정 오류입니다." },
      { status: 500 },
    );
  }

  if (resolved.status === "fetch_failed") {
    return NextResponse.json(
      { error: "서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }

  if (
    resolved.status === "invalid_company" ||
    resolved.status === "json_error"
  ) {
    return NextResponse.json(
      { error: "유효하지 않은 회사 코드입니다." },
      { status: 400 },
    );
  }

  const { baseUrl } = resolved;

  const listRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_expense_list&param1=${encodeURIComponent(empCode)}&param2=${encodeURIComponent(yearMonth)}`,
    { cache: "no-store" },
  ).catch(() => null);

  if (!listRes?.ok) {
    return NextResponse.json(
      { error: "지출결의 내역을 조회하는 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  const data: ExpenseListApiResponse = await listRes.json();

  if (data.Flag === "-1") {
    return NextResponse.json({ items: [] });
  }

  if (data.Flag !== "0") {
    return NextResponse.json(
      { error: data.MSG || "지출결의 내역을 가져올 수 없습니다." },
      { status: 502 },
    );
  }

  const items = data.items ?? [];

  return NextResponse.json({ items });
}
