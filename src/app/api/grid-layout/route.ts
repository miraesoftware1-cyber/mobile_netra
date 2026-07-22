import { NextRequest, NextResponse } from 'next/server';

// mobile-netra 그리드 레이아웃 stub — 저장 없이 코드 기본값으로만 동작
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    ok: true,
    widths: null,
    order: null,
    stickyColumnCount: null,
    hiddenColumns: null,
    columnAlign: null,
    isMaster: false,
    columnLabels: {},
  });
}

export async function PUT() {
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  return NextResponse.json({ ok: true });
}
