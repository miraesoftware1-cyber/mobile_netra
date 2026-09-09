import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import webpush from 'web-push';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { categorizeSubscriptions } from '@/lib/push/quiet-hours';
import { query } from '@/lib/db/postgres';

const schema = z.object({
  companyCode: z.string().min(1),
  emp_code:    z.string().min(1),
  year:        z.string().regex(/^\d{4}$/),
  year_seq:    z.number().int(),
  startDate:   z.string().regex(/^\d{8}$/).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, emp_code, year, year_seq, startDate } = parsed.data;

  // ERP baseUrl 조회와 PG 요청 조회 병렬 실행
  const [resolved, pgResult] = await Promise.all([
    resolveCompanyErpBaseUrl(companyCode),
    query<{ req_id: number; corp_code: string; req_emp_name: string }>(
      `SELECT req_id, COALESCE(corp_code, '') AS corp_code, COALESCE(req_emp_name, '') AS req_emp_name
       FROM netra_apvmng_requests
       WHERE emp_code=$1 AND (year_seq=$2 ${startDate ? 'OR start_date=$3' : ''})
       ORDER BY req_id DESC LIMIT 1`,
      startDate ? [emp_code, year_seq, startDate] : [emp_code, year_seq],
    ).catch(() => ({ rows: [] as { req_id: number; corp_code: string; req_emp_name: string }[] })),
  ]);

  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  if (resolved.status === 'invalid_company' || resolved.status === 'json_error')
    return NextResponse.json({ error: '유효하지 않은 회사 코드입니다.' }, { status: 400 });

  const { baseUrl } = resolved;

  // ERP 연차 취소
  const params = new URLSearchParams({
    proc:   'usp_mobile_cancel_holiday',
    param1: emp_code,
    param2: year,
    param3: String(year_seq),
  });

  const res = await fetch(`${baseUrl}/R2JsonProc.asp?${params.toString()}`).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });

  const data: { Flag: string | number; MSG: string } = await res.json();
  if (String(data.Flag) !== '0') {
    return NextResponse.json({ error: data.MSG || '취소 처리에 실패했습니다.' }, { status: 400 });
  }

  // 응답 먼저 반환, 나머지 처리(ERP 상태 변경·푸시)는 after()에서
  const pgRows = pgResult.rows;
  after(() => postCancelCleanup(baseUrl, companyCode, pgRows).catch((e) => console.error('[cancel] after 처리 실패:', e)));

  return NextResponse.json({ success: true, message: data.MSG });
}

let _cancelledReqsTableEnsured = false;

async function postCancelCleanup(
  baseUrl: string,
  companyCode: string,
  rows: { req_id: number; corp_code: string; req_emp_name: string }[],
) {
  if (rows.length === 0) {
    console.log('[cancel] PG 요청 레코드 없음 - 정리 스킵');
    return;
  }

  const { req_id: reqId, corp_code: corpCode, req_emp_name: reqEmpName } = rows[0];
  console.log('[cancel] 정리 시작 req_id:', reqId, 'corp_code:', corpCode);

  // PG cancelled_reqs 기록 + ERP detail/approvers 조회 병렬 실행
  const [, detailData] = await Promise.all([
    (_cancelledReqsTableEnsured
      ? Promise.resolve()
      : query(`CREATE TABLE IF NOT EXISTS netra_cancelled_reqs (
          req_id INTEGER PRIMARY KEY, cancelled_at TIMESTAMPTZ DEFAULT NOW()
        )`).catch(() => null).then(() => { _cancelledReqsTableEnsured = true; })
    ).then(() =>
      query(
        `INSERT INTO netra_cancelled_reqs (req_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [reqId],
      ).catch((e) => console.error('[cancel] netra_cancelled_reqs 삽입 오류:', e))
    ),
    fetch(`${baseUrl}/R2JsonProc.asp?${new URLSearchParams({
      proc: 'usp_mobile_apvmng_request_detail', param1: String(reqId),
    })}`).catch(() => null).then((r) => r?.json().catch(() => null)),
  ]);

  const currentStep = Number(detailData?.items?.[0]?.CURRENT_STEP ?? 1);

  // 현재 단계 승인자 조회 + set_step 병렬
  const [apvData, setStepData] = await Promise.all([
    fetch(`${baseUrl}/R2JsonProc.asp?${new URLSearchParams({
      proc: 'usp_mobile_apvmng_step_approvers', param1: String(reqId), param2: String(currentStep),
    })}`).catch(() => null).then((r) => r?.json().catch(() => null)),
    fetch(`${baseUrl}/R2JsonProc.asp?${new URLSearchParams({
      proc: 'usp_mobile_apvmng_set_step', param1: String(reqId), param2: 'REJECTED', param3: '1',
    })}`).catch(() => null).then((r) => r?.json().catch(() => null)),
  ]);

  console.log('[cancel] set_step:', setStepData?.Flag, setStepData?.MSG);

  // PG 정리
  await Promise.all([
    query(`DELETE FROM netra_apvmng_actions  WHERE req_id=$1`, [reqId]).catch(() => null),
    query(`DELETE FROM netra_apvmng_requests WHERE req_id=$1`, [reqId]).catch(() => null),
  ]);

  // 승인자 푸시 발송
  if (!corpCode) return;

  const approverCodes: string[] = (apvData?.items ?? [])
    .map((r: Record<string, unknown>) => String(r.EMP_CODE ?? ''))
    .filter(Boolean);
  console.log('[cancel] currentStep:', currentStep, 'approverCodes:', approverCodes);

  if (approverCodes.length === 0) {
    console.log('[cancel] 승인자 없음 - 취소 푸시 미발송');
    return;
  }

  type SubRow = { subscription: webpush.PushSubscription; emp_code: string; user_id: string | null };

  // user_id로 먼저 조회, 없으면 emp_code 폴백 (user_id ≠ emp_code 거래처 대응)
  const { rows: subs } = await query<SubRow>(
    `SELECT DISTINCT ON (endpoint) subscription, emp_code, user_id
     FROM netra_push_subs WHERE corp_code = $1 AND (user_id = ANY($2) OR emp_code = ANY($2))`,
    [corpCode, approverCodes],
  ).catch(() => ({ rows: [] as SubRow[] }));

  const { active: activeSubs, silent: silentSubs } = await categorizeSubscriptions(subs, corpCode);
  console.log('[cancel] 취소 푸시 대상 (일반:', activeSubs.length, '/ 무음:', silentSubs.length, ')');
  const basePayload = { title: '연차 신청 취소', body: `${reqEmpName || '신청자'}님이 연차 신청을 취소하였습니다.`, url: '/APVMNG/APVMNG_01', tag: `cancel-${reqId}` };
  await Promise.allSettled([
    ...activeSubs.map((row) => sendPushNotification(row.subscription, basePayload)),
    ...silentSubs.map((row) => sendPushNotification(row.subscription, { ...basePayload, silent: true })),
  ]);
}
