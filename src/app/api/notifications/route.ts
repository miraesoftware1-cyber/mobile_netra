import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/postgres';

const getSchema = z.object({
  companyCode: z.string().min(1),
  empCode:     z.string().min(1),
  limit:       z.coerce.number().int().min(1).max(100).default(50),
});

export interface NotificationRow {
  id:           number;
  title:        string;
  body:         string | null;
  type:         string;
  ref_data:     Record<string, unknown> | null;
  sent_at:      string;
  read_at:      string | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = getSchema.safeParse({
    companyCode: searchParams.get('companyCode'),
    empCode:     searchParams.get('empCode'),
    limit:       searchParams.get('limit') ?? 50,
  });
  if (!parsed.success) return NextResponse.json({ error: '잘못된 파라미터' }, { status: 400 });

  const { companyCode, empCode, limit } = parsed.data;

  const { rows } = await query<NotificationRow & { unread_count: string }>(
    `SELECT
       id, title, body, type, ref_data, sent_at, read_at,
       COUNT(*) FILTER (WHERE read_at IS NULL) OVER () AS unread_count
     FROM mobile_notifications
     WHERE company_code = $1 AND emp_code = $2
     ORDER BY sent_at DESC
     LIMIT $3`,
    [companyCode, empCode, limit],
  );

  const unreadCount = rows.length > 0 ? Number(rows[0].unread_count) : 0;
  const items: NotificationRow[] = rows.map(({ unread_count: _u, ...r }) => r);
  return NextResponse.json({ items, unreadCount });
}

const patchSchema = z.object({
  companyCode: z.string().min(1),
  empCode:     z.string().min(1),
  ids:         z.union([z.array(z.number().int()), z.literal('all')]),
});

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 파라미터' }, { status: 400 });

  const { companyCode, empCode, ids } = parsed.data;

  if (ids === 'all') {
    await query(
      `UPDATE mobile_notifications SET read_at = NOW()
       WHERE company_code = $1 AND emp_code = $2 AND read_at IS NULL`,
      [companyCode, empCode],
    );
  } else if (ids.length > 0) {
    await query(
      `UPDATE mobile_notifications SET read_at = NOW()
       WHERE company_code = $1 AND emp_code = $2 AND id = ANY($3::int[]) AND read_at IS NULL`,
      [companyCode, empCode, ids],
    );
  }

  return NextResponse.json({ ok: true });
}
