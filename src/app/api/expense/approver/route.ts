import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
  empCode: z.string().min(1),
});

interface ExpenseApproverApiRow {
  approver_code: string;
  approver_name: string;
}

interface ExpenseApproverApiResponse {
  Flag: string;
  MSG: string;
  items: ExpenseApproverApiRow[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get("companyCode"),
    empCode: searchParams.get("empCode"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { companyCode, empCode } = parsed.data;

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

  const approverRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_expense_approver&param1=${encodeURIComponent(empCode)}`,
    { cache: "no-store" },
  ).catch(() => null);

  if (!approverRes?.ok) {
    return NextResponse.json(
      { error: "승인자 정보를 조회하는 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  const data: ExpenseApproverApiResponse = await approverRes.json();

  if (data.Flag === "-1") {
    return NextResponse.json({ items: [] });
  }

  if (data.Flag !== "0") {
    return NextResponse.json(
      { error: data.MSG || "승인자 정보를 가져올 수 없습니다." },
      { status: 502 },
    );
  }

  const items = data.items ?? [];

  return NextResponse.json({ items });
}
