const ERP_BASE_URL_GATEWAY_ENV = "ERP_BASE_URL_GATEWAY_URL";
const ERP_BASE_URL_STALE_TIME_ENV = "ERP_COMPANY_BASE_URL_STALE_TIME_SECONDS";

const DEFAULT_STALE_TIME_SECONDS = 3600;

type SuccessCacheEntry = {
  baseUrl: string;
  expiresAt: number;
};

const successCache = new Map<string, SuccessCacheEntry>();

function getStaleTimeMs(): number {
  const raw = process.env[ERP_BASE_URL_STALE_TIME_ENV]?.trim();
  if (raw === undefined || raw === "") {
    return DEFAULT_STALE_TIME_SECONDS * 1000;
  }
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return seconds * 1000;
}

function takeFreshSuccessCache(companyCode: string): string | null {
  const entry = successCache.get(companyCode);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    successCache.delete(companyCode);
    return null;
  }
  return entry.baseUrl;
}

function storeSuccessCache(
  companyCode: string,
  baseUrl: string,
  staleTimeMs: number,
): void {
  if (staleTimeMs <= 0) {
    return;
  }
  successCache.set(companyCode, {
    baseUrl,
    expiresAt: Date.now() + staleTimeMs,
  });
}

export type ErpBaseUrlGatewayResponse = {
  Flag: string;
  MSG: string;
  items: Array<{ base_url: string }>;
};

export type ResolveCompanyErpBaseUrlResult =
  | { status: "ok"; baseUrl: string }
  | { status: "missing_gateway_env" }
  | {
      status: "fetch_failed";
      requestUrl: string;
      response: Response | null;
    }
  | { status: "invalid_company" }
  | { status: "json_error" };

function getErpBaseUrlGatewayOriginOrPath(): string | null {
  const raw = process.env[ERP_BASE_URL_GATEWAY_ENV]?.trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/\/+$/, "");
}

export function buildErpCompanyBaseUrlLookupUrl(companyCode: string): string | null {
  const gateway = getErpBaseUrlGatewayOriginOrPath();
  if (!gateway) {
    return null;
  }
  return `${gateway}?proc=sp_app_base_url&param1=${encodeURIComponent(companyCode)}`;
}

export async function resolveCompanyErpBaseUrl(
  companyCode: string,
  init?: RequestInit,
): Promise<ResolveCompanyErpBaseUrlResult> {
  const normalizedCompanyCode = companyCode.trim();
  if (!normalizedCompanyCode) {
    return { status: "invalid_company" };
  }

  const staleTimeMs = getStaleTimeMs();
  const useSuccessCache = init === undefined && staleTimeMs > 0;

  if (useSuccessCache) {
    const cached = takeFreshSuccessCache(normalizedCompanyCode);
    if (cached !== null) {
      return { status: "ok", baseUrl: cached };
    }
  }

  const requestUrl = buildErpCompanyBaseUrlLookupUrl(normalizedCompanyCode);
  if (!requestUrl) {
    return { status: "missing_gateway_env" };
  }

  const baseUrlRes = await fetch(requestUrl, {
    cache: "no-store",
    ...init,
  }).catch(() => null);
  if (!baseUrlRes?.ok) {
    return { status: "fetch_failed", requestUrl, response: baseUrlRes };
  }

  let baseUrlData: ErpBaseUrlGatewayResponse;
  try {
    baseUrlData = await baseUrlRes.json();
  } catch {
    return { status: "json_error" };
  }

  if (String(baseUrlData.Flag) !== "0" || !baseUrlData.items?.length) {
    return { status: "invalid_company" };
  }

  const baseUrl = baseUrlData.items[0]?.base_url;
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return { status: "invalid_company" };
  }

  if (useSuccessCache) {
    storeSuccessCache(normalizedCompanyCode, baseUrl, staleTimeMs);
  }

  return { status: "ok", baseUrl };
}
