import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSmsCode } from "@/app/api/auth/_lib/sms-code-store";

const schema = z.object({
  phoneNumber: z.string().regex(/^[0-9]{10,11}$/),
  code: z.string().length(6),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { phoneNumber, code } = parsed.data;
  const result = await validateSmsCode(phoneNumber, code);

  if (!result.success) {
    const message =
      (result as { success: false; reason: string }).reason === "expired"
        ? "인증번호가 만료되었습니다. 다시 요청해주세요."
        : "인증번호가 올바르지 않습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
