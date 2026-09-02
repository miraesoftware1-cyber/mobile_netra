import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { issueSmsCode, checkRateLimit } from "@/app/api/auth/_lib/sms-code-store";
import { sendSms } from "@/lib/sens/send-sms";

const schema = z.object({
  phoneNumber: z.string().regex(/^[0-9]{10,11}$/),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { phoneNumber } = parsed.data;

  const rateLimit = await checkRateLimit(phoneNumber);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "비정상적인 접근이 감지되어 일시적으로 차단되었습니다. 시간이 지난 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const code = issueSmsCode(phoneNumber);

  try {
    await sendSms(phoneNumber, `[Netra] 인증번호: ${code}`);
  } catch (err) {
    console.error("[request-sms-code] SMS 발송 실패:", err);
    return NextResponse.json(
      { error: "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
