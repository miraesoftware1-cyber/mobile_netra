import crypto from "crypto";

const SENS_ACCESS_KEY = process.env.NAVER_SENS_ACCESS_KEY ?? "";
const SENS_SECRET_KEY = process.env.NAVER_SENS_SECRET_KEY ?? "";
const SENS_SERVICE_ID = process.env.NAVER_SENS_SERVICE_ID ?? "";
const SENS_FROM_NUMBER = process.env.NAVER_SENS_FROM_NUMBER ?? "";

function makeSignature(timestamp: string): string {
  const path = `/sms/v2/services/${encodeURIComponent(SENS_SERVICE_ID)}/messages`;
  const message = `POST ${path}\n${timestamp}\n${SENS_ACCESS_KEY}`;
  return crypto
    .createHmac("sha256", SENS_SECRET_KEY)
    .update(message)
    .digest("base64");
}

export async function sendSms(to: string, content: string): Promise<void> {
  const timestamp = Date.now().toString();
  const path = `/sms/v2/services/${encodeURIComponent(SENS_SERVICE_ID)}/messages`;

  const res = await fetch(`https://sens.apigw.ntruss.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": SENS_ACCESS_KEY,
      "x-ncp-apigw-signature-v2": makeSignature(timestamp),
    },
    body: JSON.stringify({
      type: "SMS",
      from: SENS_FROM_NUMBER,
      content,
      messages: [{ to }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SENS 발송 실패 (${res.status}): ${body}`);
  }
}
