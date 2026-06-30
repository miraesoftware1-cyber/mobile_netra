import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
});

interface ExpenseItemApiRow {
  bslip_code: string;
  bslip_name: string;
}

interface ExpenseItemsApiResponse {
  Flag: string;
  MSG: string;
  items: ExpenseItemApiRow[];
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

  const itemsRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_expense_item`,
    { cache: "no-store" },
  ).catch(() => null);

  if (!itemsRes?.ok) {
    return NextResponse.json(
      { error: "결의항목 정보를 조회하는 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  const data: ExpenseItemsApiResponse = await itemsRes.json();

  if (data.Flag !== "0") {
    return NextResponse.json(
      { error: data.MSG || "결의항목 정보를 가져올 수 없습니다." },
      { status: 502 },
    );
  }

  const items = data.items ?? [];

  return NextResponse.json({ items });
}
