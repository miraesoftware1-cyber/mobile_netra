import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const bodySchema = z.object({
  companyCode: z.string(),
  corpCode: z.string(),
  resolutionDateYyyymmdd: z.string().regex(/^\d{8}$/),
  empCode: z.string(),
  projectCode: z.string(),
  approverCode: z.string().min(1),
  resolutionItemCode: z.string().min(1),
  vendor: z.string().min(1),
  summary: z.string(),
  supplyAmount: z.string().min(1),
  vatAmount: z.string(),
  paymentTypeCode: z.string().min(1),
  expenseDateYyyymmdd: z.string().regex(/^\d{8}$/),
  receiptPath: z.string(),
  receiptFileNames: z.string(),
  phoneNumber: z.string(),
});

interface LegacyInsertResponse {
  Flag?: number | string;
  MSG?: string;
  items?: unknown[];
}

function isLegacySuccess(flag: number | string | undefined): boolean {
  return flag === 0 || flag === "0";
}

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const b = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(b.companyCode);

  if (resolved.status === "missing_gateway_env") {
    return NextResponse.json(
      { ok: false, error: "서버 설정 오류입니다." },
      { status: 500 },
    );
  }

  if (resolved.status === "fetch_failed") {
    return NextResponse.json(
      { ok: false, error: "서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }

  if (
    resolved.status === "invalid_company" ||
    resolved.status === "json_error"
  ) {
    return NextResponse.json(
      { ok: false, error: "유효하지 않은 회사 코드입니다." },
      { status: 400 },
    );
  }

  const baseUrl = resolved.baseUrl.replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/R2JsonProc.asp`);
  url.searchParams.set("proc", "usp_mobile_insert_expense");
  url.searchParams.set("param1", b.corpCode);
  url.searchParams.set("param2", b.resolutionDateYyyymmdd);
  url.searchParams.set("param3", b.empCode);
  url.searchParams.set("param4", b.projectCode);
  url.searchParams.set("param5", b.approverCode);
  url.searchParams.set("param6", b.resolutionItemCode);
  url.searchParams.set("param7", b.vendor);
  url.searchParams.set("param8", b.summary);
  url.searchParams.set("param9", b.supplyAmount);
  url.searchParams.set("param10", b.vatAmount.trim() === "" ? "0" : b.vatAmount);
  url.searchParams.set("param11", b.paymentTypeCode);
  url.searchParams.set("param12", b.expenseDateYyyymmdd);
  url.searchParams.set("param13", b.receiptPath);
  url.searchParams.set("param14", b.receiptFileNames);
  url.searchParams.set("param15", b.phoneNumber);

  const upstream = await fetch(url.toString(), { cache: "no-store" }).catch(
    () => null,
  );

  if (!upstream?.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "지출결의 등록 서버에 연결할 수 없습니다.",
      },
      { status: 502 },
    );
  }

  const data: LegacyInsertResponse = await upstream.json().catch(() => ({}));

  if (!isLegacySuccess(data.Flag)) {
    return NextResponse.json({
      ok: false,
      error: data.MSG ?? "지출결의 등록에 실패했습니다.",
      message: data.MSG,
    });
  }

  return NextResponse.json({
    ok: true,
    message: data.MSG ?? "지출결의가 등록되었습니다.",
  });
}
