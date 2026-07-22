import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const querySchema = z.object({
  companyCode: z.string().min(1),
  yearMonth: z.string().regex(/^\d{6}$/),
});

export interface CalScdItem {
  emp_code:   string;
  emp_name:   string;
  scd_month:  string;
  scd_no1:    string;
  scd_name:   string;
  beg_date:   string;
  end_date:   string;
  scd_time:   string;
  scd_remark: string;
  created_by: string;
}

interface CalScdApiResponse {
  Flag: string;
  MSG: string;
  items: CalScdItem[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = querySchema.safeParse({
    companyCode: searchParams.get("companyCode"),
    yearMonth: searchParams.get("yearMonth"),
  });

  if (!parsed.success) return NextResponse.json({ items: [] });

  const { companyCode, yearMonth } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status !== "ok") return NextResponse.json({ items: [] });

  const { baseUrl } = resolved;

  const res = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_cal_scd&param1=${encodeURIComponent(yearMonth)}`,
    { cache: "no-store" },
  ).catch(() => null);

  if (!res?.ok) return NextResponse.json({ items: [] });

  const data: CalScdApiResponse = await res.json().catch(() => null);
  if (!data || data.Flag !== "0") return NextResponse.json({ items: [] });

  return NextResponse.json({ items: data.items ?? [] });
}
