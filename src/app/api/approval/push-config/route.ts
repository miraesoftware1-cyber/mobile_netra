import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres';

let _tableEnsured = false;
async function ensureTable() {
  if (_tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS netra_apvmng_config (
      id              SERIAL PRIMARY KEY,
      menu_id         VARCHAR(50)  NOT NULL UNIQUE,
      apv_btn_label   VARCHAR(50)  NOT NULL DEFAULT '승인',
      rej_btn_label   VARCHAR(50)  NOT NULL DEFAULT '반려',
      apv_btn_action  VARCHAR(50)  NOT NULL DEFAULT 'open_app',
      rej_btn_action  VARCHAR(50)  NOT NULL DEFAULT 'require_reason',
      updated_at      TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
  _tableEnsured = true;
}

export async function GET(req: NextRequest) {
  const menuId = req.nextUrl.searchParams.get('menuId');
  if (!menuId) return NextResponse.json({ error: 'menuId required' }, { status: 400 });

  await ensureTable();
  const { rows } = await query<{
    apv_btn_label: string; rej_btn_label: string;
    apv_btn_action: string; rej_btn_action: string;
  }>(
    `SELECT apv_btn_label, rej_btn_label, apv_btn_action, rej_btn_action
     FROM netra_apvmng_config WHERE menu_id = $1`,
    [menuId],
  );

  if (rows.length === 0) {
    return NextResponse.json({
      apvBtnLabel:  '승인', rejBtnLabel:  '반려',
      apvBtnAction: 'open_app', rejBtnAction: 'require_reason',
    });
  }
  const r = rows[0];
  return NextResponse.json({
    apvBtnLabel:  r.apv_btn_label,
    rejBtnLabel:  r.rej_btn_label,
    apvBtnAction: r.apv_btn_action,
    rejBtnAction: r.rej_btn_action,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { menuId, apvBtnLabel, rejBtnLabel, apvBtnAction, rejBtnAction } = body ?? {};
  if (!menuId) return NextResponse.json({ error: 'menuId required' }, { status: 400 });

  await ensureTable();
  await query(
    `INSERT INTO netra_apvmng_config (menu_id, apv_btn_label, rej_btn_label, apv_btn_action, rej_btn_action, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (menu_id) DO UPDATE
     SET apv_btn_label  = EXCLUDED.apv_btn_label,
         rej_btn_label  = EXCLUDED.rej_btn_label,
         apv_btn_action = EXCLUDED.apv_btn_action,
         rej_btn_action = EXCLUDED.rej_btn_action,
         updated_at     = NOW()`,
    [menuId, apvBtnLabel ?? '승인', rejBtnLabel ?? '반려', apvBtnAction ?? 'open_app', rejBtnAction ?? 'require_reason'],
  );
  return NextResponse.json({ success: true });
}
