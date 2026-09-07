import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';

import webpush from 'web-push';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { query } from '@/lib/db/postgres';

const requestSchema = z.object({
  companyCode: z.string().min(1),
  emp_code: z.string().min(1),
  emp_name: z.string().default(''),
  corp_code: z.string().default(''),
  dpt_code: z.string().default(''),
  year: z.string().regex(/^\d{4}$/),
  leaveTypeCode: z.string().min(1),
  leaveTypeName: z.string().default(''),
  appliedDate: z.string().regex(/^\d{8}$/),
  startDate: z.string().regex(/^\d{8}$/),
  endDate: z.string().regex(/^\d{8}$/),
  usedDays: z.number(),
  note: z.string().default(''),
  reason: z.string().default(''),
  phoneNumber: z.string().default(''),
});

interface InsertHolidayApiResponse {
  Flag: string | number;
  MSG: string;
  items: Array<Record<string, unknown>>;
}

type StepApprover = { stepNo: number; apvType: string; empCode: string; userId?: string; threshold: number };

type ApprovalSetup =
  | { kind: 'fallback'; corp_code: string; dpt_code: string; emp_code: string; emp_name: string }
  | {
      kind: 'flow';
      baseUrl: string; companyCode: string; corp_code: string; emp_code: string; emp_name: string;
      leaveTypeName: string; leaveTypeCode: string; startDate: string; endDate: string;
      usedDays: number; dpt_code: string;
      reqId: number; stepApprovers: StepApprover[];
      step1Config: { messageTitle?: string; messageBody?: string } | undefined;
    };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const {
    companyCode, emp_code, emp_name, corp_code, dpt_code, year,
    leaveTypeCode, leaveTypeName, appliedDate, startDate, endDate, usedDays, note, reason, phoneNumber,
  } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  if (resolved.status === 'invalid_company' || resolved.status === 'json_error')
    return NextResponse.json({ error: '유효하지 않은 회사 코드입니다.' }, { status: 400 });

  const { baseUrl } = resolved;

  const params = new URLSearchParams({
    proc: 'usp_mobile_insert_holiday',
    param1: emp_code, param2: year, param3: leaveTypeCode,
    param4: appliedDate, param5: startDate, param6: endDate,
    param7: String(usedDays), param8: note, param9: reason, param10: phoneNumber,
  });

  const insertRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params.toString()}`).catch(() => null);
  if (!insertRes?.ok) return NextResponse.json({ error: '연차 신청 중 오류가 발생했습니다.' }, { status: 502 });

  const insertData: InsertHolidayApiResponse = await insertRes.json();
  if (String(insertData.Flag) !== '0') {
    return NextResponse.json({ error: insertData.MSG || '연차 신청에 실패했습니다.' }, { status: 400 });
  }

  const yearSeq: number = Number((insertData.items)?.[0]?.YEAR_SEQ ?? 0);

  // ── 동기: 절차 확인 + 승인 요청 생성 + req_id PG 저장 (취소 연동 보장) ──────
  const setup = await prepareApproval({
    baseUrl, companyCode, corp_code, dpt_code, emp_code, emp_name,
    leaveTypeCode, leaveTypeName, appliedDate, startDate, endDate, usedDays, reason, note, yearSeq,
  });

  // ── after(): 승인자 등록 + 푸시 (느린 ERP 호출, 응답 후 실행) ───────────────
  after(() => sendNotifications(setup).catch((err) => console.error('[leave/request] 알림 실패:', err)));

  return NextResponse.json({ success: true, message: insertData.MSG });
}

function fetchWithTimeout(url: string, options?: RequestInit, ms = 5000): Promise<Response | null> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).catch(() => null).finally(() => clearTimeout(tid));
}

function replaceVars(
  template: string,
  { emp_name, emp_code, leaveTypeName, leaveTypeCode, startDate, endDate, usedDays, dpt_code, stepNo = 1 }: {
    emp_name: string; emp_code: string; leaveTypeName: string; leaveTypeCode: string;
    startDate: string; endDate: string; usedDays: number; dpt_code: string; stepNo?: number;
  },
) {
  const fmt = (d: string) => `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`;
  return template
    .replace('{신청자}',   emp_name || emp_code)
    .replace('{문서명}',   leaveTypeName || leaveTypeCode)
    .replace('{기간}',     `${fmt(startDate)}~${fmt(endDate)}`)
    .replace('{일수}',     `${usedDays}일`)
    .replace('{단계}',     `${stepNo}단계`)
    .replace('{부서}',     dpt_code)
    .replace('{requesterName}', emp_name || emp_code)
    .replace('{menuName}', '연차 신청');
}

async function prepareApproval(args: {
  baseUrl: string; companyCode: string; corp_code: string; dpt_code: string;
  emp_code: string; emp_name: string; leaveTypeCode: string; leaveTypeName: string;
  appliedDate: string; startDate: string; endDate: string; usedDays: number;
  reason: string; note: string; yearSeq: number;
}): Promise<ApprovalSetup> {
  const { baseUrl, companyCode, corp_code, dpt_code, emp_code, emp_name,
    leaveTypeCode, leaveTypeName, appliedDate, startDate, endDate, usedDays, reason, note, yearSeq } = args;

  // 1. 절차 설정 조회
  const procParams = new URLSearchParams({ proc: 'usp_mobile_apvmng_process_get', param1: 'LEAVE_01' });
  const procRes = await fetchWithTimeout(`${baseUrl}/R2JsonProc.asp?${procParams}`, { cache: 'no-store' });
  const procRaw = procRes?.ok ? await procRes.json().catch(() => null) : null;
  console.log('[approval] process_get Flag:', procRaw?.Flag);

  if (!procRaw || String(procRaw.Flag) !== '0' || !procRaw.items?.[0]?.CONFIG_JSON) {
    return { kind: 'fallback', corp_code, dpt_code, emp_code, emp_name };
  }

  const config: {
    steps: { stepNo: number; type: string; members: { empCode: string; empName: string }[]; threshold: number; messageTitle?: string; messageBody?: string }[];
  } = JSON.parse(procRaw.items[0].CONFIG_JSON);

  if (!config.steps?.length) return { kind: 'fallback', corp_code, dpt_code, emp_code, emp_name };

  // 2. INDIVIDUAL/DEPT_HEAD 승인자 즉시 resolve (그룹은 after()에서 처리)
  const stepApprovers: StepApprover[] = [];
  for (const step of config.steps) {
    if (step.type === 'group') {
      // 그룹 멤버 조회는 느려서 after()에서 처리 — placeholder 저장
      for (const m of step.members ?? []) {
        stepApprovers.push({ stepNo: step.stepNo, apvType: 'GROUP', empCode: m.empCode, userId: m.empCode, threshold: step.threshold });
      }
    } else if (step.type === 'dept_head') {
      // 부서장은 PG에서 즉시 조회 (빠름)
      const { rows: heads } = await query<{ emp_code: string }>(
        `SELECT emp_code FROM netra_push_subscriptions WHERE corp_code = $1 AND manage_dpt_codes LIKE $2`,
        [corp_code, `%${dpt_code}%`],
      ).catch(() => ({ rows: [] as { emp_code: string }[] }));
      for (const h of heads) {
        stepApprovers.push({ stepNo: step.stepNo, apvType: 'DEPT_HEAD', empCode: h.emp_code, threshold: 1 });
      }
    } else {
      for (const m of step.members ?? []) {
        stepApprovers.push({ stepNo: step.stepNo, apvType: 'INDIVIDUAL', empCode: m.empCode, userId: m.empCode, threshold: step.threshold });
      }
    }
  }

  // 3. ERP 승인 요청 생성
  const payloadJson = {
    신청자: emp_name || emp_code, 휴가종류: leaveTypeName || leaveTypeCode,
    신청일자: `${appliedDate.slice(0,4)}.${appliedDate.slice(4,6)}.${appliedDate.slice(6,8)}`,
    시작일: startDate, 종료일: endDate, 일수: `${usedDays}일`, 사유: reason || note,
    _year: startDate.slice(0, 4), _year_seq: yearSeq, _emp_code: emp_code,
  };
  const createParams = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_create',
    param1: 'LEAVE_01', param2: emp_code, param3: emp_name,
    param4: JSON.stringify(payloadJson), param5: '{}', param6: String(config.steps.length),
  });
  const createRes = await fetchWithTimeout(`${baseUrl}/R2JsonProc.asp?${createParams}`, { cache: 'no-store' });
  const createData = await createRes?.json().catch(() => null);
  const reqId: number = Number(createData?.items?.[0]?.REQ_ID ?? 0);
  console.log('[approval] request_create Flag:', createData?.Flag, 'REQ_ID:', reqId);
  if (!reqId || String(createData?.Flag) !== '0') return { kind: 'fallback', corp_code, dpt_code, emp_code, emp_name };

  // 4. req_id → PG 저장 (취소 시 필요)
  await query(`CREATE TABLE IF NOT EXISTS netra_apvmng_requests (
    id SERIAL PRIMARY KEY, req_id INTEGER NOT NULL, corp_code VARCHAR(50),
    emp_code VARCHAR(50) NOT NULL, req_emp_name VARCHAR(100),
    menu_id VARCHAR(50), year VARCHAR(4), year_seq INTEGER, start_date VARCHAR(8), created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => null);
  await query(`ALTER TABLE netra_apvmng_requests ADD COLUMN IF NOT EXISTS req_emp_name VARCHAR(100)`).catch(() => null);
  await query(`ALTER TABLE netra_apvmng_requests ADD COLUMN IF NOT EXISTS start_date VARCHAR(8)`).catch(() => null);
  await query(
    `INSERT INTO netra_apvmng_requests (req_id, corp_code, emp_code, req_emp_name, menu_id, year, year_seq, start_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [reqId, corp_code, emp_code, emp_name || emp_code, 'LEAVE_01', startDate.slice(0, 4), yearSeq, startDate],
  ).catch(() => null);
  console.log('[approval] req_id PG 저장 완료:', reqId, 'yearSeq:', yearSeq, 'startDate:', startDate);

  return {
    kind: 'flow', baseUrl, companyCode, corp_code, emp_code, emp_name,
    leaveTypeName, leaveTypeCode, startDate, endDate, usedDays, dpt_code,
    reqId, stepApprovers, step1Config: config.steps[0],
  };
}

async function sendNotifications(setup: ApprovalSetup) {
  if (setup.kind === 'fallback') {
    const { corp_code, dpt_code, emp_code, emp_name } = setup;
    const { rows } = await query<{ subscription: webpush.PushSubscription; manage_dpt_codes: string }>(
      `SELECT subscription, manage_dpt_codes FROM netra_push_subscriptions WHERE corp_code = $1`,
      [corp_code],
    );
    const targets = rows.filter((r) =>
      r.manage_dpt_codes?.split(',').map((c) => c.trim()).includes(dpt_code),
    );
    await Promise.allSettled(targets.map((r) =>
      sendPushNotification(r.subscription, {
        title: '연차 신청 알림',
        body: `${emp_name || emp_code}님이 연차를 신청했습니다.`,
        url: '/LEAVE/LEAVE_02', tag: 'leave-request',
      }),
    ));
    return;
  }

  const { baseUrl, companyCode, corp_code, emp_code, emp_name, leaveTypeName, leaveTypeCode,
    startDate, endDate, usedDays, dpt_code, reqId, stepApprovers, step1Config } = setup;

  const varArgs = { emp_name, emp_code, leaveTypeName, leaveTypeCode, startDate, endDate, usedDays, dpt_code };

  // 그룹 멤버 실제 resolve (ERP 호출)
  const resolvedApprovers: StepApprover[] = [];
  for (const apv of stepApprovers) {
    if (apv.apvType === 'GROUP') {
      const p = new URLSearchParams({ proc: 'usp_mobile_apvmng_group_members', param1: apv.empCode });
      const r = await fetchWithTimeout(`${baseUrl}/R2JsonProc.asp?${p}`, { cache: 'no-store' });
      const d = await r?.json().catch(() => null);
      const members: Array<{ EMP_CODE: string }> = d?.items ?? [];
      if (members.length === 0) {
        resolvedApprovers.push(apv);
      } else {
        for (const m of members) resolvedApprovers.push({ ...apv, empCode: m.EMP_CODE, userId: m.EMP_CODE });
      }
    } else {
      resolvedApprovers.push(apv);
    }
  }

  // 단계별 승인자 ERP 등록
  for (const apv of resolvedApprovers) {
    const p = new URLSearchParams({
      proc: 'usp_mobile_apvmng_step_apv_add',
      param1: String(reqId), param2: String(apv.stepNo),
      param3: apv.apvType, param4: apv.empCode, param5: String(apv.threshold),
    });
    const r = await fetchWithTimeout(`${baseUrl}/R2JsonProc.asp?${p}`, { cache: 'no-store' });
    const d = await r?.json().catch(() => null);
    console.log('[approval] step_apv_add', apv.empCode, 'Flag:', d?.Flag);
  }

  // 1단계 승인자 구독 조회 + 푸시
  const step1Approvers = resolvedApprovers.filter((a) => a.stepNo === 1);
  const groupIds    = step1Approvers.filter((a) => a.userId).map((a) => a.userId as string);
  const deptCodes   = step1Approvers.filter((a) => !a.userId).map((a) => a.empCode);

  let subs: { subscription: webpush.PushSubscription; emp_code: string }[] = [];
  if (groupIds.length > 0) {
    const ph = groupIds.map((_, i) => `$${i+2}`).join(',');
    const { rows } = await query<{ subscription: webpush.PushSubscription; emp_code: string }>(
      `SELECT subscription, emp_code FROM netra_push_subscriptions WHERE corp_code=$1 AND user_id IN (${ph})`,
      [corp_code, ...groupIds],
    );
    subs = [...subs, ...rows];
  }
  if (deptCodes.length > 0) {
    const ph = deptCodes.map((_, i) => `$${i+2}`).join(',');
    const { rows } = await query<{ subscription: webpush.PushSubscription; emp_code: string }>(
      `SELECT subscription, emp_code FROM netra_push_subscriptions WHERE corp_code=$1 AND emp_code IN (${ph})`,
      [corp_code, ...deptCodes],
    );
    subs = [...subs, ...rows];
  }

  if (subs.length === 0) return;

  const msgTitle = replaceVars(step1Config?.messageTitle ?? '연차 신청 알림', varArgs);
  const msgBody  = replaceVars(step1Config?.messageBody  ?? '{신청자}님이 연차를 신청했습니다.', varArgs);

  await Promise.allSettled(subs.map((row) =>
    sendPushNotification(row.subscription, {
      title: msgTitle, body: msgBody,
      url: `/APVMNG/APVMNG_01?requestId=${reqId}`,
      tag: `approval-${reqId}`,
      approvalAction: { reqId, companyCode, corpCode: corp_code, empCode: row.emp_code, empName: '' },
    }),
  ));
}
