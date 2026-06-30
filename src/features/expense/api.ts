export interface ExpensePayTypeItem {
  c_code: string;
  c_name: string;
  c_attr3?: string | null;
}

export interface ExpenseResolutionItem {
  bslip_code: string;
  bslip_name: string;
}

export interface ExpenseProjectItem {
  prj_code: string;
  prj_name: string;
}

export interface ExpenseApproverItem {
  approver_code: string;
  approver_name: string;
}

interface ApiErrorResponse {
  error: string;
}

type ExpensePayTypesResult =
  | { success: true; data: ExpensePayTypeItem[] }
  | { success: false; error: string };

export async function fetchExpensePayTypes(
  companyCode: string,
): Promise<ExpensePayTypesResult> {
  const params = new URLSearchParams({ companyCode });
  const res = await fetch(`/api/expense/pay-types?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: "결제구분 정보를 불러오는 중 오류가 발생했습니다.",
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: ExpensePayTypeItem[] } = await res.json();
  return { success: true, data: data.items ?? [] };
}

type ExpenseResolutionItemsResult =
  | { success: true; data: ExpenseResolutionItem[] }
  | { success: false; error: string };

export async function fetchExpenseResolutionItems(
  companyCode: string,
): Promise<ExpenseResolutionItemsResult> {
  const params = new URLSearchParams({ companyCode });
  const res = await fetch(`/api/expense/resolution-items?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: "결의항목 정보를 불러오는 중 오류가 발생했습니다.",
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: ExpenseResolutionItem[] } = await res.json();
  return { success: true, data: data.items ?? [] };
}

type ExpenseProjectsResult =
  | { success: true; data: ExpenseProjectItem[] }
  | { success: false; error: string };

type ExpenseApproversResult =
  | { success: true; data: ExpenseApproverItem[] }
  | { success: false; error: string };

type UploadExpenseReceiptsResult =
  | { success: true; uploadedRemotePaths: string[] }
  | { success: false; error: string };

export async function fetchExpenseApprovers(
  companyCode: string,
  empCode: string,
): Promise<ExpenseApproversResult> {
  const params = new URLSearchParams({ companyCode, empCode });
  const res = await fetch(`/api/expense/approver?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: "승인자 정보를 불러오는 중 오류가 발생했습니다.",
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: ExpenseApproverItem[] } = await res.json();
  return { success: true, data: data.items ?? [] };
}

export async function fetchExpenseProjects(
  companyCode: string,
): Promise<ExpenseProjectsResult> {
  const params = new URLSearchParams({ companyCode });
  const res = await fetch(`/api/expense/projects?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: "프로젝트 정보를 불러오는 중 오류가 발생했습니다.",
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: ExpenseProjectItem[] } = await res.json();
  return { success: true, data: data.items ?? [] };
}

export async function uploadExpenseReceipts(
  companyCode: string,
  resolutionDate: string,
  files: File[],
): Promise<UploadExpenseReceiptsResult> {
  const formData = new FormData();
  formData.append("companyCode", companyCode);
  formData.append("resolutionDate", resolutionDate);

  files.forEach((file) => {
    formData.append("file1", file);
  });

  const res = await fetch("/api/expense/upload-receipts", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: "영수증 업로드 중 오류가 발생했습니다.",
    }));
    return { success: false, error: errorData.error };
  }

  const data: {
    success?: boolean;
    upstream?: { uploadedFiles?: string[] };
  } = await res.json().catch(() => ({}));

  const uploadedRemotePaths = data.upstream?.uploadedFiles ?? [];
  if (!data.success || uploadedRemotePaths.length === 0) {
    return {
      success: false,
      error: "영수증 업로드 응답이 올바르지 않습니다.",
    };
  }

  return { success: true, uploadedRemotePaths };
}

export type InsertExpenseResolutionInput = {
  companyCode: string;
  corpCode: string;
  resolutionDateYyyymmdd: string;
  empCode: string;
  projectCode: string;
  approverCode: string;
  resolutionItemCode: string;
  vendor: string;
  summary: string;
  supplyAmount: string;
  vatAmount: string;
  paymentTypeCode: string;
  expenseDateYyyymmdd: string;
  receiptPath: string;
  receiptFileNames: string;
  phoneNumber: string;
};

type InsertExpenseResolutionResult =
  | { success: true; message: string }
  | { success: false; error: string };

export interface ExpenseInquiryApiItem {
  sch_date: string;
  bslip_name: string;
  bslip_sum: number;
  slip_type: string;
  cst_name: string;
}

type ExpenseInquiryListResult =
  | { success: true; data: ExpenseInquiryApiItem[] }
  | { success: false; error: string };

export async function fetchExpenseInquiryList(
  companyCode: string,
  empCode: string,
  yearMonthYyyymm: string,
): Promise<ExpenseInquiryListResult> {
  const params = new URLSearchParams({
    companyCode,
    empCode,
    yearMonth: yearMonthYyyymm,
  });
  const res = await fetch(`/api/expense/expense-list?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: "지출결의 내역을 불러오는 중 오류가 발생했습니다.",
    }));
    return { success: false as const, error: errorData.error };
  }

  const data: { items: ExpenseInquiryApiItem[] } = await res.json();
  return { success: true as const, data: data.items ?? [] };
}

export async function insertExpenseResolution(
  input: InsertExpenseResolutionInput,
): Promise<InsertExpenseResolutionResult> {
  const res = await fetch("/api/expense/insert-resolution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload: { ok?: boolean; message?: string; error?: string } =
    await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      success: false,
      error: payload.error ?? "지출결의 등록 중 오류가 발생했습니다.",
    };
  }

  if (!payload.ok) {
    return {
      success: false,
      error: payload.error ?? payload.message ?? "지출결의 등록에 실패했습니다.",
    };
  }

  return {
    success: true,
    message: payload.message ?? "지출결의가 등록되었습니다.",
  };
}
