import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import webpush from 'web-push';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { query } from '@/lib/db/postgres';

const schema = z.object({
  companyCode: z.string().min(1),
  emp_code:    z.string().min(1),
  year:        z.string().regex(/^\d{4}$/),
  year_seq:    z.number().int(),
  startDate:   z.string().regex(/^\d{8}$/).optional(),
});

async function ensureCancelledTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS netra_cancelled_reqs (
      req_id INTEGER PRIMARY KEY,
      cancelled_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => null);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { companyCode, emp_code, year, year_seq, startDate } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: '서버 설정 오류입니다.' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: '서버에 연결할 수 없습니다.' }, { status: 502 });
  if (resolved.status === 'invalid_company' || resolved.status === 'json_error')
    return NextResponse.json({ error: '유효하지 않은 회사 코드입니다.' }, { status: 400 });

  const { baseUrl } = resolved;

  // 1. ERP 연차 취소
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

  // 2. 연동된 승인 요청 취소
  try {
    console.log('[cancel] PG 조회 시도:', { emp_code, year, year_seq, startDate });
    // year_seq 조회 먼저, 실패 시 startDate로 대체 조회
    let rows: { req_id: number; corp_code: string; req_emp_name: string }[] = [];
    const bySeq = await query<{ req_id: number; corp_code: string; req_emp_name: string }>(
      `SELECT req_id, COALESCE(corp_code, '') AS corp_code, COALESCE(req_emp_name, '') AS req_emp_name
       FROM netra_apvmng_requests WHERE emp_code=$1 AND year=$2 AND year_seq=$3 LIMIT 1`,
      [emp_code, year, year_seq],
    );
    rows = bySeq.rows;
    if (rows.length === 0 && startDate) {
      console.log('[cancel] year_seq 조회 실패, startDate로 재시도:', startDate);
      const byDate = await query<{ req_id: number; corp_code: string; req_emp_name: string }>(
        `SELECT req_id, COALESCE(corp_code, '') AS corp_code, COALESCE(req_emp_name, '') AS req_emp_name
         FROM netra_apvmng_requests WHERE emp_code=$1 AND start_date=$2 LIMIT 1`,
        [emp_code, startDate],
      );
      rows = byDate.rows;
    }
    console.log('[cancel] PG 조회 결과:', rows.length, '건', rows[0] ?? '없음');

    if (rows.length > 0) {
      const { req_id: reqId, corp_code: corpCode, req_emp_name: reqEmpName } = rows[0];

      // ERP 승인 요청 상태를 REJECTED로 변경 (CANCELLED는 미지원)
      const setStepParams = new URLSearchParams({
        proc:   'usp_mobile_apvmng_set_step',
        param1: String(reqId),
        param2: 'REJECTED',
        param3: '1',
      });
      const setStepRes = await fetch(`${baseUrl}/R2JsonProc.asp?${setStepParams}`).catch(() => null);
      const setStepData = await setStepRes?.json().catch(() => null);
      console.log('[cancel] set_step 결과:', setStepData?.Flag, setStepData?.MSG);

      // PG에 취소된 req_id 기록 (대기중 목록 필터링용)
      await ensureCancelledTable();
      await query(
        `INSERT INTO netra_cancelled_reqs (req_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [reqId],
      ).catch(() => null);

      // 현재 단계 승인자에게 취소 푸시 발송
      if (corpCode) {
        try {
          // 현재 단계 조회
          const detailParams = new URLSearchParams({
            proc:   'usp_mobile_apvmng_request_detail',
            param1: String(reqId),
          });
          const detailRes  = await fetch(`${baseUrl}/R2JsonProc.asp?${detailParams}`).catch(() => null);
          const detailData = await detailRes?.json().catch(() => null);
          const currentStep = Number(detailData?.items?.[0]?.CURRENT_STEP ?? 1);

          // 현재 단계 승인자 조회
          const apvParams = new URLSearchParams({
            proc:   'usp_mobile_apvmng_step_approvers',
            param1: String(reqId),
            param2: String(currentStep),
          });
          const apvRes  = await fetch(`${baseUrl}/R2JsonProc.asp?${apvParams}`).catch(() => null);
          const apvData = await apvRes?.json().catch(() => null);
          const approverCodes: string[] = (apvData?.items ?? [])
            .map((r: Record<string, unknown>) => String(r.EMP_CODE ?? ''))
            .filter(Boolean);

          if (approverCodes.length > 0) {
            const ph = approverCodes.map((_, i) => `$${i + 2}`).join(',');
            const { rows: subs } = await query<{ subscription: webpush.PushSubscription }>(
              `SELECT subscription FROM netra_push_subscriptions WHERE corp_code = $1 AND user_id IN (${ph})`,
              [corpCode, ...approverCodes],
            );
            await Promise.allSettled(
              subs.map((row) =>
                sendPushNotification(row.subscription, {
                  title: '연차 신청 취소',
                  body:  `${reqEmpName || emp_code}님이 연차 신청을 취소하였습니다.`,
                  url:   '/APVMNG/APVMNG_01',
                  tag:   `cancel-${reqId}`,
                }),
              ),
            );
          }
        } catch (err) {
          console.error('[cancel] 취소 푸시 실패:', err);
        }
      }

      // PG 액션·요청 매핑 정리
      await query(`DELETE FROM netra_apvmng_actions  WHERE req_id=$1`, [reqId]).catch(() => null);
      await query(`DELETE FROM netra_apvmng_requests WHERE req_id=$1`, [reqId]).catch(() => null);
    }
  } catch (err) {
    console.error('[cancel] 승인 요청 취소 실패:', err);
  }

  return NextResponse.json({ success: true, message: data.MSG });
}
