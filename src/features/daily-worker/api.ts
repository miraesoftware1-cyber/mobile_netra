export interface DailyWorkerNameItem {
  etc_code: string;
  etc_name: string;
}

export interface DailyWorkerListItem {
  etc_code: string;
  att_corp_code: string;
  etc_name: string;
  cel_no: string | null;
  gender: string;
  etc_idno: string;
}

export interface DailyWorkerCorpItem {
  c_code: string;
  c_name: string;
}

type DailyWorkerCorpsResult =
  | { success: true; data: DailyWorkerCorpItem[] }
  | { success: false; error: string };

export async function fetchDailyWorkerCorps(
  companyCode: string,
): Promise<DailyWorkerCorpsResult> {
  const params = new URLSearchParams({ companyCode });
  const res = await fetch(`/api/daily-worker/corps?${params.toString()}`);

  if (!res.ok) {
    const err: { error: string } = await res.json().catch(() => ({
      error: "업체 목록을 불러오는 중 오류가 발생했습니다.",
    }));
    return { success: false, error: err.error };
  }

  const data: { items: DailyWorkerCorpItem[] } = await res.json();
  return { success: true, data: data.items ?? [] };
}

export type InsertDailyWorkerInput = {
  companyCode: string;
  attCorpCode: string;
  etcName: string;
  etcIdno: string;
  celNo: string;
  gender: "M" | "W";
  userId: string;
};

type InsertDailyWorkerResult =
  | { success: true; message: string; etcCode?: string }
  | { success: false; error: string };

interface ApiErrorResponse {
  error: string;
}

export type DailyWorkerNamesResult =
  | { success: true; data: DailyWorkerNameItem[] }
  | { success: false; error: string };

export async function fetchDailyWorkerNames(
  companyCode: string,
): Promise<DailyWorkerNamesResult> {
  const params = new URLSearchParams({ companyCode });
  const res = await fetch(`/api/daily-worker/names?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: "일용직 성명 목록을 불러오는 중 오류가 발생했습니다.",
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: DailyWorkerNameItem[] } = await res.json();
  return { success: true, data: data.items ?? [] };
}

export type DailyWorkerListResult =
  | { success: true; data: DailyWorkerListItem[] }
  | { success: false; error: string };

export async function fetchDailyWorkerList(
  companyCode: string,
  corpCode: string,
  etcCode: string,
): Promise<DailyWorkerListResult> {
  const params = new URLSearchParams({ companyCode, corpCode, etcCode });
  const res = await fetch(`/api/daily-worker/list?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: "일용직 인사정보를 불러오는 중 오류가 발생했습니다.",
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: DailyWorkerListItem[] } = await res.json();
  return { success: true, data: data.items ?? [] };
}

export async function insertDailyWorker(
  input: InsertDailyWorkerInput,
): Promise<InsertDailyWorkerResult> {
  const res = await fetch("/api/daily-worker/insert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload: { ok?: boolean; message?: string; error?: string; etcCode?: string } =
    await res.json().catch(() => ({}));

  if (!res.ok || !payload.ok) {
    return {
      success: false,
      error: payload.error ?? "일용직 인사정보 등록 중 오류가 발생했습니다.",
    };
  }

  return {
    success: true,
    message: payload.message ?? "정상 처리되었습니다.",
    etcCode: payload.etcCode,
  };
}
