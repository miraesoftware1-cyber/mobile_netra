import { NextRequest, NextResponse } from "next/server";

import { resolveCompanyErpBaseUrl } from "@/lib/erp/resolve-company-erp-base-url";

const MAX_UPSTREAM_BODY_LENGTH = 2000;
const UPLOAD_CHUNK_SIZE = 256 * 1024;

async function readResponseBodySafely(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.slice(0, MAX_UPSTREAM_BODY_LENGTH);
}

function getUploadEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/Default.aspx`;
}

function normalizeDateText(value: string | null): string {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return digits;
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function buildRemoteFileName(
  originalName: string,
  resolutionDateText: string,
): string {
  const fileName = originalName.replace(/[^0-9A-Za-z가-힣_.-]/g, "_");
  return `mobile/receipt/${resolutionDateText}/${fileName}`;
}

async function uploadFileByChunks(
  endpoint: string,
  file: File,
  resolutionDateText: string,
): Promise<
  | { success: true; remoteName: string }
  | {
      success: false;
      status: number | null;
      statusText: string;
      body: string;
      remoteName: string;
    }
> {
  const remoteName = buildRemoteFileName(file.name, resolutionDateText);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const totalChunks = Math.max(1, Math.ceil(bytes.length / UPLOAD_CHUNK_SIZE));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * UPLOAD_CHUNK_SIZE;
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, bytes.length);
    const chunk = bytes.subarray(start, end);
    const base64Data = Buffer.from(chunk).toString("base64");
    const isLast = chunkIndex === totalChunks - 1 ? "1" : "0";
    const append = chunkIndex === 0 ? "0" : "1";

    const body = new URLSearchParams({
      name: remoteName,
      data: base64Data,
      append,
      end: isLast,
    });

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body.toString(),
    }).catch(() => null);

    if (!res?.ok) {
      const upstreamBody = res ? await readResponseBodySafely(res.clone()) : "";
      return {
        success: false,
        status: res?.status ?? null,
        statusText: res?.statusText ?? "NETWORK_ERROR",
        body: upstreamBody,
        remoteName,
      };
    }
  }

  return { success: true, remoteName };
}

export async function POST(request: NextRequest) {
  const incomingFormData = await request.formData().catch(() => null);

  if (!incomingFormData) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const companyCode = incomingFormData.get("companyCode");
  const resolutionDateRaw = incomingFormData.get("resolutionDate");
  const files = incomingFormData.getAll("file1");
  const resolutionDateText =
    typeof resolutionDateRaw === "string"
      ? normalizeDateText(resolutionDateRaw)
      : normalizeDateText(null);

  if (
    typeof companyCode !== "string" ||
    !companyCode ||
    files.length === 0
  ) {
    return NextResponse.json(
      { error: "필수 값이 누락되었습니다." },
      { status: 400 },
    );
  }

  const resolved = await resolveCompanyErpBaseUrl(companyCode);

  if (resolved.status === "missing_gateway_env") {
    return NextResponse.json(
      { error: "서버 설정 오류입니다." },
      { status: 500 },
    );
  }

  if (resolved.status === "fetch_failed") {
    const upstreamBody = resolved.response
      ? await readResponseBodySafely(resolved.response.clone())
      : "";
    return NextResponse.json(
      {
        error: "base_url 조회에 실패했습니다.",
        upstream: {
          step: "base_url",
          requestUrl: resolved.requestUrl,
          status: resolved.response?.status ?? null,
          statusText: resolved.response?.statusText ?? "NETWORK_ERROR",
          body: upstreamBody,
        },
      },
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
  const uploadUrl = getUploadEndpoint(baseUrl);
  const validFiles = files.filter((file): file is File => file instanceof File);
  const uploadedRemoteNames: string[] = [];

  for (const file of validFiles) {
    const uploadResult = await uploadFileByChunks(
      uploadUrl,
      file,
      resolutionDateText,
    );
    if ("status" in uploadResult) {
      return NextResponse.json(
        {
          error: "영수증 업로드에 실패했습니다.",
          upstream: {
            step: "upload_file",
            requestUrl: uploadUrl,
            status: uploadResult.status,
            statusText: uploadResult.statusText,
            body: uploadResult.body,
            fileName: uploadResult.remoteName,
          },
        },
        { status: 502 },
      );
    }
    uploadedRemoteNames.push(uploadResult.remoteName);
  }

  return NextResponse.json({
    success: true,
    upstream: {
      step: "upload_file",
      requestUrl: uploadUrl,
      uploadedFiles: uploadedRemoteNames,
    },
  });
}
