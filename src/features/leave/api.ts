export interface ApprovalListItem {
  year_rdate: string;
  emp_code: string;
  emp_name: string;
  year_alday: number;
  year_reday: number;
  year_emday: number;
  holiday_typ: string;
  year_bdate: string;
  year_edate: string;
  year_reason: string;
  year_st: string;
  year_seq: string;
}

type ApprovalListResult =
  | { success: true; data: ApprovalListItem[]; emptyMessage?: string }
  | { success: false; error: string };

type ApproveResult =
  | { success: true; message: string }
  | { success: false; error: string };

export interface ApproveItem {
  emp_code: string;
  year_st: string;
  year_seq: string;
}

export async function fetchApprovalList(
  companyCode: string,
  corp_code: string,
  manage_dpt_codes: string,
  year: string
): Promise<ApprovalListResult> {
  const params = new URLSearchParams({
    companyCode,
    corp_code,
    manage_dpt_codes,
    year,
  });
  const res = await fetch(`/api/leave/approval-list?${params.toString()}`);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: '승인 대기 목록을 불러오는 중 오류가 발생했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: ApprovalListItem[]; message?: string } = await res.json();
  const items = data.items ?? [];
  return {
    success: true,
    data: items,
    ...(items.length === 0 && data.message
      ? { emptyMessage: data.message }
      : {}),
  };
}

export async function fetchDepartmentLeaveList(
  companyCode: string,
  corp_code: string,
  manage_dpt_codes: string,
  year: string
): Promise<DepartmentHolidayListResult> {
  const params = new URLSearchParams({
    companyCode,
    corp_code,
    manage_dpt_codes,
    year,
  });
  const res = await fetch(`/api/leave/department-holiday-list?${params.toString()}`);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: '부서 연차/휴가 내역을 불러오는 중 오류가 발생했습니다.',
    }));
    return { success: false, error: (errorData as ApiErrorResponse).error };
  }

  const data: { items: DepartmentHolidayListItem[]; message?: string } = await res.json();
  const items = data.items ?? [];
  return {
    success: true,
    items,
    ...(items.length === 0 && data.message
      ? { emptyMessage: data.message }
      : {}),
  };
}

export async function approveLeave(
  companyCode: string,
  items: ApproveItem[]
): Promise<ApproveResult> {
  const res = await fetch('/api/leave/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyCode, items }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: '처리 중 오류가 발생했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  const data: { success: boolean; message: string } = await res.json();
  return { success: true, message: data.message };
}

export interface HolidayInfo {
  year_alday: number;
  year_reday: number;
}

export interface HolidayTypeItem {
  holi_type_code: string;
  holi_type_name: string;
  subtract_flag: string;
  subtract_val: string | null;
  init_flag: string;
}

export interface CompanyHolidayItem {
  hdate: string;
  holiday_name: string;
}

interface ApiErrorResponse {
  error: string;
}

type HolidayInfoResult =
  | { success: true; data: HolidayInfo }
  | { success: false; error: string };

type HolidayTypeResult =
  | { success: true; data: HolidayTypeItem[] }
  | { success: false; error: string };

type CompanyHolidaysResult =
  | { success: true; data: CompanyHolidayItem[] }
  | { success: false; error: string };

type CompanyHolidaysByCorpResult =
  | { success: true; items: CompanyHolidayItem[]; emptyMessage?: string }
  | { success: false; error: string };

export async function fetchHolidayInfo(
  companyCode: string,
  emp_code: string,
  year: string
): Promise<HolidayInfoResult> {
  const params = new URLSearchParams({ companyCode, emp_code, year });
  const res = await fetch(`/api/leave/holiday-info?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: '연차 정보를 불러오는 중 오류가 발생했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  const data: HolidayInfo = await res.json();
  return { success: true, data };
}

export async function fetchHolidayTypes(
  companyCode: string
): Promise<HolidayTypeResult> {
  const params = new URLSearchParams({ companyCode });
  const res = await fetch(`/api/leave/holiday-type?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: '휴가 구분 정보를 불러오는 중 오류가 발생했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: HolidayTypeItem[] } = await res.json();
  return { success: true, data: data.items };
}

export interface LeaveRequestPayload {
  companyCode: string;
  emp_code: string;
  emp_name?: string;
  corp_code?: string;
  dpt_code?: string;
  year: string;
  leaveTypeCode: string;
  leaveTypeName?: string;
  appliedDate: string;
  startDate: string;
  endDate: string;
  usedDays: number;
  note: string;
  reason: string;
  phoneNumber: string;
}

type LeaveRequestResult =
  | { success: true; message: string }
  | { success: false; error: string };

export async function submitLeaveRequest(
  payload: LeaveRequestPayload
): Promise<LeaveRequestResult> {
  const res = await fetch('/api/leave/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: '연차 신청 중 오류가 발생했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  const data: { success: boolean; message: string } = await res.json();
  return { success: true, message: data.message };
}

export async function fetchCompanyHolidays(
  companyCode: string,
  corpCode: string,
  year: string
): Promise<CompanyHolidaysResult> {
  const params = new URLSearchParams({ companyCode, corpCode, year });
  const res = await fetch(`/api/leave/company-holidays?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: '휴무 정보를 불러오는 중 오류가 발생했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: CompanyHolidayItem[] } = await res.json();
  return { success: true, data: data.items };
}

export async function fetchCompanyHolidaysByCorp(
  companyCode: string,
  corp_code: string,
  year: string
): Promise<CompanyHolidaysByCorpResult> {
  const params = new URLSearchParams({ companyCode, corp_code, year });
  const res = await fetch(`/api/leave/company-holidays-by-corp?${params.toString()}`);

  if (!res.ok) {
    const errorData: ApiErrorResponse = await res.json().catch(() => ({
      error: '회사 휴일 정보를 불러오는 중 오류가 발생했습니다.',
    }));
    return { success: false, error: errorData.error };
  }

  const data: { items: CompanyHolidayItem[]; message?: string } = await res.json();
  const items = data.items ?? [];
  return {
    success: true,
    items,
    ...(items.length === 0 && data.message ? { emptyMessage: data.message } : {}),
  };
}

export interface HolidayListItem {
  emp_code: string;
  emp_name: string;
  year_alday: number;
  year_reday: number;
  year_emday: number;
  holiday_typ: string;
  year_bdate: string;
  year_edate: string;
  app_status: string;
  year_chk?: string;
  year_seq?: number;
  year_st?: string;
}

export interface DepartmentHolidayListItem {
  emp_code: string;
  emp_name: string;
  dpt_name?: string;
  year_emday: number;
  holiday_typ: string;
  year_bdate: string;
  year_edate: string;
}

type DepartmentHolidayListResult =
  | { success: true; items: DepartmentHolidayListItem[]; emptyMessage?: string }
  | { success: false; error: string };

type HolidayListResult =
  | { success: true; items: HolidayListItem[]; emptyMessage?: string }
  | { success: false; error: string };

type CancelLeaveResult =
  | { success: true; message: string }
  | { success: false; error: string };

export async function cancelLeave(
  companyCode: string,
  emp_code: string,
  year: string,
  year_seq: number,
): Promise<CancelLeaveResult> {
  const res = await fetch('/api/leave/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyCode, emp_code, year, year_seq }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: '취소 처리 중 오류가 발생했습니다.' }));
    return { success: false, error: (errorData as ApiErrorResponse).error };
  }

  const data: { success: boolean; message: string } = await res.json();
  return { success: true, message: data.message };
}

export async function fetchHolidayList(
  companyCode: string,
  corp_code: string,
  year: string,
  emp_code: string = ''
): Promise<HolidayListResult> {
  const params = new URLSearchParams({
    companyCode,
    corp_code,
    year,
    emp_code,
  });
  const res = await fetch(`/api/leave/holiday-list?${params.toString()}`);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: '연차 내역을 불러오는 중 오류가 발생했습니다.',
    }));
    return { success: false, error: (errorData as ApiErrorResponse).error };
  }

  const data: { items: HolidayListItem[]; message?: string } = await res.json();
  const items = data.items ?? [];
  return {
    success: true,
    items,
    ...(items.length === 0 && data.message
      ? { emptyMessage: data.message }
      : {}),
  };
}
