import { NextRequest, NextResponse } from "next/server";
import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

export interface CalScdRow extends Record<string, unknown> {
  emp_code:   string;
  scd_month:  string;
  scd_no1:    string;
  scd_key:    string;   // 내부용 복합키: scd_month_scd_no1
  scd_name:   string;
  beg_date:   string;
  end_date:   string;
  scd_time:   string;
  scd_remark: string;
}

interface RawCalScdItem {
  emp_code:   string;
  scd_month:  string;
  scd_no1:    string;
  scd_name:   string;
  beg_date:   string;
  end_date:   string;
  scd_time:   string;
  scd_remark: string;
}

interface ErpResponse {
  Flag: string | number;
  MSG:  string;
  items?: RawCalScdItem[];
}

function isSuccess(flag: string | number | undefined): boolean {
  return String(flag) === "0";
}

async function callProc(companyCode: string, mode: string, data: string) {
  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== "ok") return null;
  const { baseUrl } = resolved;
  const res = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_cal_scd&param1=${encodeURIComponent(mode)}&param2=${encodeURIComponent(data)}`,
    { cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null) as Promise<ErpResponse | null>;
}

// 조회: GET /api/schedule-crud?companyCode=...&empCode=...&startDate=YYYYMMDD&endDate=YYYYMMDD
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyCode = searchParams.get("companyCode") ?? "";
  const empCode     = searchParams.get("empCode")     ?? "";
  const startDate   = searchParams.get("startDate")   ?? "";
  const endDate     = searchParams.get("endDate")     ?? "";
  if (!companyCode || !empCode) return NextResponse.json({ items: [] });

  const param = [empCode, startDate, endDate].join("|");
  const data = await callProc(companyCode, "S", param);
  if (!data || !isSuccess(data.Flag)) return NextResponse.json({ items: [] });

  const items: CalScdRow[] = (data.items ?? []).map((r) => ({
    ...r,
    scd_time:  r.scd_time  ?? "",
    scd_key:   `${r.scd_month}_${r.scd_no1}`,
  }));
  return NextResponse.json({ items });
}

// 추가: POST  — emp_code | scd_name | beg_date | end_date | scd_time | scd_remark | user_id
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.companyCode) return NextResponse.json({ ok: false, message: "잘못된 요청" });

  const { companyCode, emp_code, scd_name, beg_date, end_date, scd_time, scd_remark, user_id } = body;
  const param = [emp_code, scd_name, beg_date, end_date, scd_time ?? "", scd_remark ?? "", user_id ?? emp_code].join("|");

  const data = await callProc(companyCode, "I", param);
  if (!data || !isSuccess(data.Flag)) return NextResponse.json({ ok: false, message: data?.MSG ?? "저장 실패" });
  return NextResponse.json({ ok: true });
}

// 수정: PUT  — emp_code | scd_month | scd_no1 | scd_name | beg_date | end_date | scd_time | scd_remark | user_id
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.companyCode) return NextResponse.json({ ok: false, message: "잘못된 요청" });

  const { companyCode, emp_code, scd_month, scd_no1, scd_name, beg_date, end_date, scd_time, scd_remark, user_id } = body;
  const param = [emp_code, scd_month, scd_no1, scd_name, beg_date, end_date, scd_time ?? "", scd_remark ?? "", user_id ?? emp_code].join("|");

  const data = await callProc(companyCode, "U", param);
  if (!data || !isSuccess(data.Flag)) return NextResponse.json({ ok: false, message: data?.MSG ?? "수정 실패" });
  return NextResponse.json({ ok: true });
}

// 삭제: DELETE  — emp_code | scd_month | scd_no1
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.companyCode) return NextResponse.json({ ok: false, message: "잘못된 요청" });

  const { companyCode, emp_code, scd_month, scd_no1 } = body;
  const param = [emp_code, scd_month, scd_no1].join("|");

  const data = await callProc(companyCode, "D", param);
  if (!data || !isSuccess(data.Flag)) return NextResponse.json({ ok: false, message: data?.MSG ?? "삭제 실패" });
  return NextResponse.json({ ok: true });
}
