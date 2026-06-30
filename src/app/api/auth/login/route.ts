import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthEmailVerificationEnabled } from "@/app/api/auth/_lib/email-verification-enabled";
import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const loginRequestSchema = z.object({
  companyCode: z.string().min(1),
  phoneNumber: z.string().min(1),
});

interface EmpInfoApiResponse {
  Flag: string;
  MSG: string;
  items: Array<{
    corp_code: string;
    corp_name: string;
    dpt_code: string;
    dpt_name: string;
    leader_flag: string;
    manage_dpt_codes: string;
    manage_dpt_names: string;
    emp_code: string;
    emp_name: string;
    email?: string;
  }>;
}

export async function POST(request: NextRequest) {
  const emailVerificationEnabled = isAuthEmailVerificationEnabled();

  const body = await request.json().catch(() => null);

  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { companyCode, phoneNumber } = parsed.data;

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

  const empInfoRes = await fetch(
    `${baseUrl}/R2JsonProc.asp?proc=usp_mobile_get_emp_info&param1=${encodeURIComponent(phoneNumber)}`,
  ).catch(() => null);

  if (!empInfoRes?.ok) {
    return NextResponse.json(
      { error: "사용자 정보를 조회하는 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  const empInfoData: EmpInfoApiResponse = await empInfoRes.json();

  if (empInfoData.Flag !== "0" || !empInfoData.items.length) {
    return NextResponse.json(
      { error: "등록된 사용자를 찾을 수 없습니다." },
      { status: 401 },
    );
  }

  const {
    corp_code,
    corp_name,
    dpt_code,
    dpt_name,
    leader_flag,
    manage_dpt_codes,
    manage_dpt_names,
    emp_code,
    emp_name,
    email,
  } = empInfoData.items[0];

  const resolvedEmail = (email ?? "").trim();

  if (emailVerificationEnabled) {
    if (!resolvedEmail) {
      return NextResponse.json(
        { error: "등록된 이메일 정보를 찾을 수 없습니다." },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    emailVerificationEnabled,
    corp_code,
    corp_name,
    dpt_code,
    dpt_name,
    leader_flag,
    manage_dpt_codes: manage_dpt_codes ?? "",
    manage_dpt_names: manage_dpt_names ?? "",
    emp_code,
    emp_name,
    email: resolvedEmail,
  });
}
