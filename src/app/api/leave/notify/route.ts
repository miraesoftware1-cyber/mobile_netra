import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCompanyErpBaseUrl } from '@/lib/erp/resolve-company-erp-base-url';
import { sendPushNotification } from '@/lib/push/send-push';
import { categorizeSubscriptions } from '@/lib/push/quiet-hours';
import { query } from '@/lib/db/postgres';
import webpush from 'web-push';

function fmtDate(d: string) {
  if (!d || d.length < 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

// ─── GET: 연차 알림 조회 (LIST / DETAIL) ─────────────────────────────────────

const getSchema = z.object({
  companyCode:  z.string().min(1),
  corpCode:     z.string().min(1),
  mode:         z.enum(['LIST', 'DETAIL']),
  year:         z.string().length(4),
  dptCode:      z.string().optional().default(''),
  empStatus:    z.string().optional().default(''),
  empCode:      z.string().optional().default(''),
  yearStdate:   z.string().optional().default(''),   // 기준일 yyyyMMdd
  hurryDate:    z.string().optional().default(''),   // 촉진일 yyyyMMdd
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = getSchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    corpCode:    searchParams.get('corpCode'),
    mode:        searchParams.get('mode'),
    year:        searchParams.get('year'),
    dptCode:     searchParams.get('dptCode')     ?? '',
    empStatus:   searchParams.get('empStatus')   ?? '',
    empCode:     searchParams.get('empCode')     ?? '',
    yearStdate:  searchParams.get('yearStdate')  ?? '',
    hurryDate:   searchParams.get('hurryDate')   ?? '',
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 파라미터입니다.' }, { status: 400 });
  }

  const { companyCode, corpCode, mode, year, dptCode, empStatus, empCode, yearStdate, hurryDate } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: 'ERP 설정 오류' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: 'ERP 연결 실패' }, { status: 502 });
  if (resolved.status !== 'ok')                  return NextResponse.json({ error: '사업장 정보 오류' }, { status: 400 });

  const { baseUrl } = resolved;

  const params = new URLSearchParams({
    proc:   'usp_mobile_leave_notify_query',
    param1: mode,
    param2: year,
    param3: corpCode,
    param4: dptCode    || ' ',
    param5: empStatus  || ' ',
    param6: empCode    || ' ',
    param7: yearStdate || ' ',
    param8: hurryDate  || ' ',
  });

  const erpRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!erpRes?.ok) {
    const text = await erpRes?.text().catch(() => '');
    console.error('[leave/notify GET] ERP error:', erpRes?.status, text?.slice(0, 300));
    return NextResponse.json({ error: 'ERP 조회 실패', detail: text?.slice(0, 300) }, { status: 502 });
  }

  const erpData: { Flag: string; MSG: string; items: Record<string, unknown>[] } = await erpRes.json().catch(() => null);
  if (!erpData) return NextResponse.json({ error: 'ERP 응답 오류' }, { status: 502 });
  if (erpData.Flag === '-1') return NextResponse.json({ items: [] });
  if (erpData.Flag !== '0') return NextResponse.json({ error: erpData.MSG }, { status: 400 });

  const items = erpData.items ?? [];

  // LIST 모드: netra_push_subs 에서 구독 여부 확인
  if (mode === 'LIST' && items.length > 0) {
    const empCodes = items.map((i) => String(i.emp_code));
    const { rows: subRows } = await query<{ emp_code: string }>(
      `SELECT DISTINCT emp_code FROM netra_push_subs WHERE corp_code = $1 AND emp_code = ANY($2::text[])`,
      [corpCode, empCodes],
    );
    const subscribedSet = new Set(subRows.map((r) => r.emp_code));
    const itemsWithSub = items.map((i) => ({
      ...i,
      has_subscription: subscribedSet.has(String(i.emp_code)),
    }));
    return NextResponse.json({ items: itemsWithSub });
  }

  return NextResponse.json({ items });
}

// ─── POST: 모바일 알림 전송 ───────────────────────────────────────────────────

const postSchema = z.object({
  companyCode: z.string().min(1),
  corpCode:    z.string().min(1),
  empCode:     z.string().min(1),
  yearSt:      z.string().length(4),
  prtNo1:      z.number().int(),
  userId:      z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 파라미터입니다.' }, { status: 400 });
  }

  const { companyCode, corpCode, empCode, yearSt, prtNo1, userId } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: 'ERP 설정 오류' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: 'ERP 연결 실패' }, { status: 502 });
  if (resolved.status !== 'ok')                  return NextResponse.json({ error: '사업장 정보 오류' }, { status: 400 });

  const { baseUrl } = resolved;

  // ERP: mobile_send_yn 업데이트 + 알림 발송용 직원 정보 반환
  const params = new URLSearchParams({
    proc:   'usp_mobile_leave_notify_send',
    param1: corpCode,
    param2: empCode,
    param3: yearSt,
    param4: String(prtNo1),
    param5: userId,
  });

  const erpRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!erpRes?.ok) return NextResponse.json({ error: 'ERP 처리 실패' }, { status: 502 });

  const erpData: {
    Flag: string; MSG: string;
    items: Array<{ emp_code: string; emp_name: string; year_reday: number; hurry_date: string }>;
  } = await erpRes.json().catch(() => null);

  if (!erpData) return NextResponse.json({ error: 'ERP 응답 오류' }, { status: 502 });
  if (erpData.Flag !== '0') return NextResponse.json({ error: erpData.MSG }, { status: 400 });

  const info = erpData.items?.[0];
  if (!info) return NextResponse.json({ error: '직원 정보를 찾을 수 없습니다.' }, { status: 404 });

  // 구독 정보 조회
  const { rows } = await query<{ subscription: webpush.PushSubscription; emp_code: string; user_id: string | null }>(
    `SELECT subscription, emp_code, user_id FROM netra_push_subs WHERE corp_code = $1 AND emp_code = $2`,
    [corpCode, empCode],
  );

  if (rows.length > 0) {
    const hurryText = info.hurry_date ? ` · 촉구일 ${fmtDate(info.hurry_date)}` : '';
    const payload = {
      title: '연차 사용 촉구 알림',
      body:  `잔여 연차 ${info.year_reday}일${hurryText}`,
      url:   '/LEAVE/LEAVE_05',
      tag:   `leave-notify-${empCode}-${yearSt}-${prtNo1}`,
    };

    const { active, silent } = await categorizeSubscriptions(rows, corpCode);
    await Promise.allSettled([
      ...active.map((r) => sendPushNotification(r.subscription, payload)),
      ...silent.map((r) => sendPushNotification(r.subscription, { ...payload, silent: true })),
    ]);
  }

  // 알림 이력 저장 (푸쉬 구독 여부 무관하게 항상 저장)
  await query(
    `INSERT INTO mobile_notifications (company_code, emp_code, title, body, type, ref_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      companyCode, empCode,
      '연차 사용 촉구 알림',
      `잔여 연차 ${info.year_reday}일${info.hurry_date ? ` · 촉구일 ${fmtDate(info.hurry_date)}` : ''}`,
      'leave_notify',
      JSON.stringify({ yearSt, prtNo1 }),
    ],
  ).catch(() => { /* 알림 저장 실패는 무시 */ });

  return NextResponse.json({ ok: true, pushed: rows.length > 0 });
}

// ─── PUT: 명세 생성 ───────────────────────────────────────────────────────────

const putSchema = z.object({
  companyCode:  z.string().min(1),
  corpCode:     z.string().min(1),
  empCode:      z.string().min(1),
  yearSt:       z.string().length(4),
  yearStdate:   z.string().length(8),   // 기준일 yyyyMMdd
  hurryDate:    z.string().length(8),   // 촉진일 yyyyMMdd
  userId:       z.string().min(1),
});

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 파라미터입니다.' }, { status: 400 });
  }

  const { companyCode, corpCode, empCode, yearSt, yearStdate, hurryDate, userId } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: 'ERP 설정 오류' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: 'ERP 연결 실패' }, { status: 502 });
  if (resolved.status !== 'ok')                  return NextResponse.json({ error: '사업장 정보 오류' }, { status: 400 });

  const { baseUrl } = resolved;

  const params = new URLSearchParams({
    proc:   'usp_mobile_leave_notify_create',
    param1: corpCode,
    param2: empCode,
    param3: yearSt,
    param4: yearStdate,
    param5: hurryDate,
    param6: userId,
  });

  const erpRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!erpRes?.ok) return NextResponse.json({ error: 'ERP 처리 실패' }, { status: 502 });

  const erpData: { Flag: string; MSG: string; items: Array<{ prt_no1: number }> } =
    await erpRes.json().catch(() => null);

  if (!erpData) return NextResponse.json({ error: 'ERP 응답 오류' }, { status: 502 });
  if (erpData.Flag !== '0') return NextResponse.json({ error: erpData.MSG }, { status: 400 });

  return NextResponse.json({ ok: true, prtNo1: erpData.items?.[0]?.prt_no1 });
}

// ─── DELETE: 명세 삭제 ────────────────────────────────────────────────────────

const deleteSchema = z.object({
  companyCode: z.string().min(1),
  corpCode:    z.string().min(1),
  empCode:     z.string().min(1),
  yearSt:      z.string().length(4),
  prtNo1:      z.number().int(),
});

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 파라미터입니다.' }, { status: 400 });
  }

  const { companyCode, corpCode, empCode, yearSt, prtNo1 } = parsed.data;

  const resolved = await resolveCompanyErpBaseUrl(companyCode);
  if (resolved.status === 'missing_gateway_env') return NextResponse.json({ error: 'ERP 설정 오류' }, { status: 500 });
  if (resolved.status === 'fetch_failed')        return NextResponse.json({ error: 'ERP 연결 실패' }, { status: 502 });
  if (resolved.status !== 'ok')                  return NextResponse.json({ error: '사업장 정보 오류' }, { status: 400 });

  const { baseUrl } = resolved;

  const params = new URLSearchParams({
    proc:   'usp_mobile_leave_notify_delete',
    param1: corpCode,
    param2: empCode,
    param3: yearSt,
    param4: String(prtNo1),
  });

  const erpRes = await fetch(`${baseUrl}/R2JsonProc.asp?${params}`, { cache: 'no-store' }).catch(() => null);
  if (!erpRes?.ok) return NextResponse.json({ error: 'ERP 처리 실패' }, { status: 502 });

  const erpData: { Flag: string; MSG: string } = await erpRes.json().catch(() => null);
  if (!erpData) return NextResponse.json({ error: 'ERP 응답 오류' }, { status: 502 });
  if (erpData.Flag !== '0') return NextResponse.json({ error: erpData.MSG }, { status: 400 });

  return NextResponse.json({ ok: true });
}
