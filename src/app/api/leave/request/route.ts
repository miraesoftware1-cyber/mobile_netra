import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';

import webpush from 'web-push';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { categorizeSubscriptions } from '@/lib/push/quiet-hours';
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

let _reqsTableEnsured = false;

type StepApprover = { stepNo: number; apvType: string; empCode: string; userId?: string };

type RequesterPush = { pushEnabled: boolean; messageTitle?: string; messageBody?: string };

type ApprovalSetup =
  | { kind: 'fallback'; corp_code: string; dpt_code: string; emp_code: string; emp_name: string }
  | {
      kind: 'flow';
      baseUrl: string; companyCode: string; corp_code: string; emp_code: string; emp_name: string;
      leaveTypeName: string; leaveTypeCode: string; startDate: string; endDate: string;
      usedDays: number; dpt_code: string;
      reqId: number; stepApprovers: StepApprover[];
      step1Config: { messageTitle?: string; messageBody?: string } | undefined;
      requesterPush: RequesterPush | undefined;
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

  const insertParams = new URLSearchParams({
    proc: 'usp_mobile_insert_holiday',
    param1: emp_code, param2: year, param3: leaveTypeCode,
    param4: appliedDate, param5: startDate, param6: endDate,
    param7: String(usedDays), param8: note, param9: reason, param10: phoneNumber,
  });

  const insertRes = await fetch(`${baseUrl}/R2JsonProc.asp?${insertParams.toString()}`).catch(() => null);

  if (!insertRes?.ok) return NextResponse.json({ error: '연차 신청 중 오류가 발생했습니다.' }, { status: 502 });

  const insertData: InsertHolidayApiResponse = await insertRes.json();
  if (String(insertData.Flag) !== '0') {
    return NextResponse.json({ error: insertData.MSG || '연차 신청에 실패했습니다.' }, { status: 400 });
  }

  const yearSeq: number = Number((insertData.items)?.[0]?.YEAR_SEQ ?? 0);

  // ── 동기: 승인 요청 생성 + req_id PG 저장 (취소 연동 보장) ──────
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
    .replace('{문서명}',   '연차 신청')
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
  prefetchedProcRes?: Response | null;
}): Promise<ApprovalSetup> {
  const { baseUrl, companyCode, corp_code, dpt_code, emp_code, emp_name,
    leaveTypeCode, leaveTypeName, appliedDate, startDate, endDate, usedDays, reason, note, yearSeq } = args;

  // 1. ERP에서 절차 설정 조회 (MyBuilder에서 관리)
  const procParams = new URLSearchParams({
    proc: 'usp_mobile_apvmng_process_get',
    param1: 'LEAVE_01',
  });
  const procRes = await fetchWithTimeout(`${baseUrl}/R2JsonProc.asp?${procParams}`, { cache: 'no-store' });
  const procData = await procRes?.json().catch(() => null);

  type CfgRow = { step_no: number; step_type: string; push_enabled: boolean; msg_title: string | null; msg_body: string | null };
  let cfgRows: CfgRow[] = [];
  if (String(procData?.Flag) === '0' && Array.isArray(procData?.items)) {
    cfgRows = (procData.items as Record<string, unknown>[]).map((item, idx) => ({
      step_no:      Number(item.STEP_NO ?? idx + 1),
      step_type:    String(item.STEP_TYPE ?? ''),
      push_enabled: item.PUSH_YN === 'Y',
      msg_title:    (item.MSG_TITLE as string | null) ?? null,
      msg_body:     (item.MSG_BODY  as string | null) ?? null,
    })).filter(r => r.step_type);

    // PG 커스텀 메시지 오버레이 (선택)
    try {
      const { rows: msgRows } = await query<{ step_type: string; msg_title: string | null; msg_body: string | null }>(
        'SELECT step_type, msg_title, msg_body FROM netra_apvmng_step_msg WHERE menu_id = $1',
        ['LEAVE_01'],
      );
      const msgMap = new Map(msgRows.map(r => [r.step_type, r]));
      cfgRows = cfgRows.map(r => {
        const pg = msgMap.get(r.step_type);
        return { ...r, msg_title: pg?.msg_title ?? r.msg_title, msg_body: pg?.msg_body ?? r.msg_body };
      });
    } catch { /* 무시 */ }
  }

  console.log('[approval] ERP 단계 수:', cfgRows.length);
  if (!cfgRows.length) {
    return { kind: 'fallback', corp_code, dpt_code, emp_code, emp_name };
  }

  // 2. ERP 조직도 계층 조회 (usp_mobile_apvmng_get_hierarchy)
  const hierParams = new URLSearchParams({
    proc: 'usp_mobile_apvmng_get_hierarchy',
    param1: corp_code, param2: dpt_code, param3: emp_code,
  });
  const hierRes = await fetchWithTimeout(`${baseUrl}/R2JsonProc.asp?${hierParams}`, { cache: 'no-store' });
  const hierData = await hierRes?.json().catch(() => null);
  console.log('[approval] get_hierarchy items:', hierData?.items?.length ?? 0);

  // step_type → 조회된 emp_code 매핑 (첫 번째 결과만 사용 — 단일 승인자)
  const hierMap = new Map<string, { empCode: string; empName: string }>();
  for (const row of (hierData?.items ?? []) as { STEP_TYPE: string; EMP_CODE: string; EMP_NAME: string }[]) {
    if (!hierMap.has(row.STEP_TYPE)) {
      hierMap.set(row.STEP_TYPE, { empCode: row.EMP_CODE, empName: row.EMP_NAME });
    }
  }

  // 3. 설정된 단계 × 계층 조회 결과 매핑 → 실제 승인자 목록
  // requester(담당) 단계는 신청자 본인이므로 승인 체인에서 제외, 접수 확인 푸시만 발송
  const requesterCfgRow = cfgRows.find(r => r.step_type === 'requester');
  const requesterPush: RequesterPush | undefined = requesterCfgRow
    ? { pushEnabled: requesterCfgRow.push_enabled, messageTitle: requesterCfgRow.msg_title ?? undefined, messageBody: requesterCfgRow.msg_body ?? undefined }
    : undefined;

  const stepApprovers: StepApprover[] = [];
  let stepNo = 0;
  for (const cfg of cfgRows) {
    if (cfg.step_type === 'requester') continue; // 승인 불필요, 위에서 requesterPush로 처리
    const approver = hierMap.get(cfg.step_type);
    if (!approver) {
      console.log(`[approval] ${cfg.step_type} 승인자 없음 — 단계 건너뜀`);
      continue;
    }
    stepNo += 1;
    stepApprovers.push({
      stepNo,
      apvType: cfg.step_type.toUpperCase(),
      empCode: approver.empCode,
      userId:  approver.empCode,
    });
  }

  if (!stepApprovers.length) {
    console.log('[approval] 유효한 승인자 없음 — fallback');
    return { kind: 'fallback', corp_code, dpt_code, emp_code, emp_name };
  }

  // 첫 실제 승인 단계(requester 제외) 메시지 설정
  const firstApprovalCfg = cfgRows.find(r => r.step_type !== 'requester');
  const step1Config = firstApprovalCfg
    ? { messageTitle: firstApprovalCfg.msg_title ?? undefined, messageBody: firstApprovalCfg.msg_body ?? undefined }
    : undefined;

  // 4. ERP 승인 요청 생성
  const payloadJson = {
    신청자: emp_name || emp_code, 휴가종류: leaveTypeName || leaveTypeCode,
    신청일자: `${appliedDate.slice(0,4)}.${appliedDate.slice(4,6)}.${appliedDate.slice(6,8)}`,
    시작일: startDate, 종료일: endDate, 일수: `${usedDays}일`, 사유: reason || note,
    _year: startDate.slice(0, 4), _year_seq: yearSeq, _emp_code: emp_code,
  };
  const createParams = new URLSearchParams({
    proc: 'usp_mobile_apvmng_request_create',
    param1: 'LEAVE_01', param2: emp_code, param3: emp_name,
    param4: JSON.stringify(payloadJson), param5: '{}', param6: String(stepApprovers.length),
  });
  const createRes = await fetchWithTimeout(`${baseUrl}/R2JsonProc.asp?${createParams}`, { cache: 'no-store' });
  const createData = await createRes?.json().catch(() => null);
  const reqId: number = Number(createData?.items?.[0]?.REQ_ID ?? 0);
  console.log('[approval] request_create Flag:', createData?.Flag, 'MSG:', createData?.items?.[0]?.MSG ?? createData?.MSG, 'REQ_ID:', reqId);
  if (!reqId || String(createData?.Flag) !== '0') return { kind: 'fallback', corp_code, dpt_code, emp_code, emp_name };

  // 단계별 승인자 등록 (그룹 resolve 완료된 상태)
  await Promise.allSettled(
    stepApprovers.map((apv) => {
      const p = new URLSearchParams({
        proc: 'usp_mobile_apvmng_step_apv_add',
        param1: String(reqId), param2: String(apv.stepNo),
        param3: apv.apvType, param4: apv.empCode,
      });
      return fetchWithTimeout(`${baseUrl}/R2JsonProc.asp?${p}`, { cache: 'no-store' });
    }),
  );

  // 4. req_id → PG 저장 (취소 시 필요)
  if (!_reqsTableEnsured) {
    await query(`CREATE TABLE IF NOT EXISTS netra_apvmng_requests (
      id SERIAL PRIMARY KEY, req_id INTEGER NOT NULL, corp_code VARCHAR(50),
      emp_code VARCHAR(50) NOT NULL, req_emp_name VARCHAR(100),
      menu_id VARCHAR(50), year VARCHAR(4), year_seq INTEGER, start_date VARCHAR(8), created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => null);
    await Promise.all([
      query(`ALTER TABLE netra_apvmng_requests ADD COLUMN IF NOT EXISTS req_emp_name VARCHAR(100)`).catch(() => null),
      query(`ALTER TABLE netra_apvmng_requests ADD COLUMN IF NOT EXISTS start_date VARCHAR(8)`).catch(() => null),
    ]);
    _reqsTableEnsured = true;
  }
  await query(
    `INSERT INTO netra_apvmng_requests (req_id, corp_code, emp_code, req_emp_name, menu_id, year, year_seq, start_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [reqId, corp_code, emp_code, emp_name || emp_code, 'LEAVE_01', startDate.slice(0, 4), yearSeq, startDate],
  ).catch(() => null);
  console.log('[approval] req_id PG 저장 완료:', reqId, 'yearSeq:', yearSeq, 'startDate:', startDate);

  return {
    kind: 'flow', baseUrl, companyCode, corp_code, emp_code, emp_name,
    leaveTypeName, leaveTypeCode, startDate, endDate, usedDays, dpt_code,
    reqId, stepApprovers, step1Config, requesterPush,
  };
}

async function sendNotifications(setup: ApprovalSetup) {
  if (setup.kind === 'fallback') {
    const { corp_code, dpt_code, emp_code, emp_name } = setup;
    const { rows } = await query<{ subscription: webpush.PushSubscription; manage_dpt_codes: string; emp_code: string; user_id: string | null }>(
      `SELECT subscription, manage_dpt_codes, emp_code, user_id FROM netra_push_subs WHERE corp_code = $1`,
      [corp_code],
    );
    const dptRows = rows.filter((r) =>
      r.manage_dpt_codes?.split(',').map((c) => c.trim()).includes(dpt_code),
    );
    const { active: dptActive, silent: dptSilent } = await categorizeSubscriptions(dptRows, corp_code);
    const basePayload = { title: '연차 신청 알림', body: `${emp_name || emp_code}님이 연차를 신청했습니다.`, url: '/LEAVE/LEAVE_02', tag: 'leave-request' };
    await Promise.allSettled([
      ...dptActive.map((r) => sendPushNotification(r.subscription, basePayload)),
      ...dptSilent.map((r) => sendPushNotification(r.subscription, { ...basePayload, silent: true })),
    ]);
    return;
  }

  const { baseUrl, companyCode, corp_code, emp_code, emp_name, leaveTypeName, leaveTypeCode,
    startDate, endDate, usedDays, dpt_code, reqId, stepApprovers, step1Config, requesterPush } = setup;

  const varArgs = { emp_name, emp_code, leaveTypeName, leaveTypeCode, startDate, endDate, usedDays, dpt_code };

  // 신청자 접수 확인 푸시 (requester 단계 push_enabled=Y인 경우)
  if (requesterPush?.pushEnabled) {
    type SubRow2 = { subscription: webpush.PushSubscription; emp_code: string; user_id: string | null };
    const { rows: reqSubs } = await query<SubRow2>(
      `SELECT subscription, emp_code, user_id FROM netra_push_subs WHERE corp_code=$1 AND emp_code=$2`,
      [corp_code, emp_code],
    ).catch(() => ({ rows: [] as SubRow2[] }));
    if (reqSubs.length > 0) {
      const reqTitle = replaceVars(requesterPush.messageTitle ?? '연차 신청 접수', varArgs);
      const reqBody  = replaceVars(requesterPush.messageBody  ?? '연차 신청이 접수되었습니다.', varArgs);
      await Promise.allSettled(reqSubs.map(r =>
        sendPushNotification(r.subscription, { title: reqTitle, body: reqBody, url: '/LEAVE/LEAVE_02', tag: `leave-req-${emp_code}` }),
      ));
      console.log('[push] 신청자 접수 확인 푸시:', emp_code, '(', reqSubs.length, '건)');
    } else {
      console.log('[push] 신청자 구독 없음:', emp_code);
    }
  }

  // 1단계 승인자 구독 조회 + 푸시 (stepApprovers는 prepareApproval에서 이미 resolve 완료)
  const step1Approvers = stepApprovers.filter((a) => a.stepNo === 1);
  const groupIds    = step1Approvers.filter((a) => a.userId).map((a) => a.userId as string);
  const deptCodes   = step1Approvers.filter((a) => !a.userId).map((a) => a.empCode);

  console.log('[push] corp_code:', corp_code, 'groupIds:', groupIds, 'deptCodes:', deptCodes);

  type SubRow = { subscription: webpush.PushSubscription; emp_code: string; user_id: string | null };
  let subs: SubRow[] = [];
  if (groupIds.length > 0) {
    const ph = groupIds.map((_, i) => `$${i+2}`).join(',');
    const { rows } = await query<SubRow>(
      `SELECT subscription, emp_code, user_id FROM netra_push_subs WHERE corp_code=$1 AND user_id IN (${ph})`,
      [corp_code, ...groupIds],
    );
    console.log('[push] user_id 조회 결과:', rows.length, '건, emp_codes:', rows.map(r=>r.emp_code));
    subs = [...subs, ...rows];
  }
  if (deptCodes.length > 0) {
    const ph = deptCodes.map((_, i) => `$${i+2}`).join(',');
    const { rows } = await query<SubRow>(
      `SELECT subscription, emp_code, user_id FROM netra_push_subs WHERE corp_code=$1 AND emp_code IN (${ph})`,
      [corp_code, ...deptCodes],
    );
    console.log('[push] emp_code 조회 결과:', rows.length, '건');
    subs = [...subs, ...rows];
  }

  // 구독자 없으면 emp_code로 재시도 (user_id ≠ emp_code인 거래처 대응)
  if (subs.length === 0 && groupIds.length > 0) {
    // 진단: corp_code 내 전체 구독 확인
    const { rows: allSubs } = await query<{ emp_code: string; user_id: string | null }>(
      `SELECT emp_code, user_id FROM netra_push_subs WHERE corp_code=$1`,
      [corp_code],
    ).catch(() => ({ rows: [] }));
    console.log('[push] corp_code', corp_code, '전체 구독:', allSubs.map(r => `emp=${r.emp_code}/uid=${r.user_id}`));

    const ph = groupIds.map((_, i) => `$${i+2}`).join(',');
    const { rows: empRows } = await query<SubRow>(
      `SELECT subscription, emp_code, user_id FROM netra_push_subs WHERE corp_code=$1 AND emp_code IN (${ph})`,
      [corp_code, ...groupIds],
    );
    console.log('[push] emp_code 폴백 조회:', empRows.length, '건');
    subs = [...subs, ...empRows];
  }

  const msgTitle = replaceVars(step1Config?.messageTitle ?? '연차 신청 알림', varArgs);
  const msgBody  = replaceVars(step1Config?.messageBody  ?? '{신청자}님이 연차를 신청했습니다.', varArgs);
  console.log('[push] 메시지 내용 →', JSON.stringify({ title: msgTitle, body: msgBody, url: `/APVMNG/APVMNG_01?requestId=${reqId}` }));

  const { active: activeSubs, silent: silentSubs } = await categorizeSubscriptions(subs, corp_code);

  if (activeSubs.length + silentSubs.length === 0) {
    console.log('[push] 구독자 없음 - 푸시 미발송');
    return;
  }

  console.log('[push] 푸시 발송 (일반:', activeSubs.length, '/ 무음:', silentSubs.length, ')');

  // 푸시 버튼 설정 조회 (Postgres)
  let pushCfg = { apvBtnLabel: '승인', rejBtnLabel: '반려', apvBtnAction: 'open_app', rejBtnAction: 'require_reason' };
  try {
    const { rows: cfgRows } = await query<{ apv_btn_label: string; rej_btn_label: string; apv_btn_action: string; rej_btn_action: string }>(
      'SELECT apv_btn_label, rej_btn_label, apv_btn_action, rej_btn_action FROM netra_apvmng_config WHERE menu_id = $1',
      ['LEAVE_01'],
    );
    if (cfgRows[0]) {
      const r = cfgRows[0];
      pushCfg = { apvBtnLabel: r.apv_btn_label, rejBtnLabel: r.rej_btn_label, apvBtnAction: r.apv_btn_action, rejBtnAction: r.rej_btn_action };
    }
  } catch { /* 무시 */ }

  const makePayload = (row: SubRow, isSilent: boolean) => ({
    title: msgTitle, body: msgBody,
    url: `/APVMNG/APVMNG_01?requestId=${reqId}`,
    tag: `approval-${reqId}`,
    ...(isSilent ? { silent: true as const } : {}),
    apvBtnLabel:  pushCfg.apvBtnLabel,
    rejBtnLabel:  pushCfg.rejBtnLabel,
    apvBtnAction: pushCfg.apvBtnAction,
    rejBtnAction: pushCfg.rejBtnAction,
    approvalAction: { reqId, companyCode, corpCode: corp_code, empCode: row.emp_code, empName: '' },
  });

  const allSubs = [...activeSubs.map(r => ({ row: r, silent: false })), ...silentSubs.map(r => ({ row: r, silent: true }))];
  const results = await Promise.allSettled(allSubs.map(({ row, silent }) =>
    sendPushNotification(row.subscription, makePayload(row, silent)),
  ));
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error('[push] 발송 실패 emp_code:', allSubs[i].row.emp_code, r.reason);
    else console.log('[push] 발송 성공 emp_code:', allSubs[i].row.emp_code, allSubs[i].silent ? '(무음)' : '');
  });
}
