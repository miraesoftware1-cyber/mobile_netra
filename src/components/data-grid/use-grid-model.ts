'use client';

import { useCallback, useMemo, useState } from 'react';
import type { GridColumn, GridRow, RowStatus } from './types';

let seq = 0;
function newKey(): string {
  seq += 1;
  return `__new_${seq}`;
}

function toGridRows<T extends Record<string, unknown>>(data: T[], keyField: keyof T & string): GridRow<T>[] {
  return data.map((row) => ({
    ...row,
    __key: String(row[keyField]),
    __status: 'unchanged' as RowStatus,
    __original: row,
  }));
}

// null/undefined와 빈 문자열을 같은 "값 없음"으로 보고 비교한다 — updateCell의 same 비교와 동일한 규칙.
function valuesEqual(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

// 지금 행 값이 원본(__original)과 필드 하나라도 다르면 dirty. 이걸로 __status를 다시 계산해야,
// 값을 바꿨다가 도로 원래대로 되돌렸을 때 'update' 상태(노란색)가 그대로 눌어붙지 않는다.
function isDirtyAgainstOriginal<T extends Record<string, unknown>>(row: GridRow<T>, original: T): boolean {
  return (Object.keys(original) as (keyof T)[]).some((field) => !valuesEqual(row[field], original[field]));
}

// ERP_WEB_CLAUDE의 useGridModel과 동일한 역할: 원본 rows를 그리드용 상태(신규/수정/삭제)가 붙은
// rows로 감싸고, addRow/updateCell/deleteRow/getChangedRows 등 CRUD 조작을 제공한다.
export function useGridModel<T extends Record<string, unknown>>(keyField: keyof T & string) {
  const [rows, setRows] = useState<GridRow<T>[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const loadRows = useCallback(
    (data: T[]) => {
      setRows(toGridRows(data, keyField));
    },
    [keyField]
  );

  // afterKey를 주면 그 행 바로 다음 자리에 끼워 넣는다(보통 지금 포커스된 행) — 없으면 맨 뒤에 추가.
  const addRow = useCallback((defaults: Partial<T>, afterKey?: string | null) => {
    const key = newKey();
    const newRow = { ...(defaults as T), __key: key, __status: 'insert' as RowStatus };
    setRows((prev) => {
      const idx = afterKey ? prev.findIndex((r) => r.__key === afterKey) : -1;
      if (idx === -1) return [...prev, newRow];
      return [...prev.slice(0, idx + 1), newRow, ...prev.slice(idx + 1)];
    });
    return key;
  }, []);

  const updateCell = useCallback((key: string, field: keyof T, value: unknown) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.__key !== key) return r;
        // null/undefined와 빈 문자열은 같은 "값 없음"으로 보고 비교 — select 편집기가 null을 ''로 표시하기 때문에
        // 값을 안 바꾸고 Tab만 눌러도 null -> '' 로 바뀐 것처럼 보여 dirty 처리되는 것을 방지.
        const same = valuesEqual(r[field], value);
        if (same) return r;
        const next = { ...r, [field]: value } as GridRow<T>;
        // insert/delete 중인 행은 그대로 두고, 기존 행만 원본과 비교해 update/unchanged를 다시 매긴다.
        if (next.__status === 'update' || next.__status === 'unchanged') {
          next.__status = next.__original && !isDirtyAgainstOriginal(next, next.__original) ? 'unchanged' : 'update';
        }
        return next;
      })
    );
  }, []);

  // 편집 세션(행 단위)을 취소할 때 그 행을 세션 시작 시점 스냅샷으로 되돌린다.
  const revertRow = useCallback((key: string, snapshot: GridRow<T>) => {
    setRows((prev) => prev.map((r) => (r.__key === key ? snapshot : r)));
  }, []);

  const deleteRow = useCallback((key: string) => {
    setRows((prev) => {
      const target = prev.find((r) => r.__key === key);
      if (!target) return prev;
      if (target.__status === 'insert') return prev.filter((r) => r.__key !== key);
      return prev.map((r) => (r.__key === key ? { ...r, __status: 'delete' } : r));
    });
  }, []);

  const resetDirty = useCallback(() => {
    // __original도 지금 값으로 새로 맞춰야 한다 — 안 그러면 이후 updateCell의 dirty 비교가 저장 전
    // 원본과 계속 비교돼서, 이미 저장된 값인데도 원래대로 되돌리면 'update'가 안 풀리는 문제가 생긴다.
    setRows((prev) =>
      prev
        .filter((r) => r.__status !== 'delete')
        .map((r) => {
          const { __key, __status, __original, ...data } = r;
          return { ...r, __status: 'unchanged' as RowStatus, __original: data as unknown as T };
        })
    );
  }, []);

  const visibleRows = useMemo(() => rows.filter((r) => r.__status !== 'delete'), [rows]);

  const changedRows = useMemo(() => rows.filter((r) => r.__status !== 'unchanged'), [rows]);
  const isDirty = changedRows.length > 0;

  return {
    rows,
    visibleRows,
    changedRows,
    isDirty,
    loadRows,
    addRow,
    updateCell,
    revertRow,
    deleteRow,
    resetDirty,
    focusedKey,
    setFocusedKey,
  };
}

// 필수(required) 컬럼이 비어있는 신규/수정 행이 있는지 검사 — 저장 전에 호출.
export function validateRows<T extends Record<string, unknown>>(
  rows: GridRow<T>[],
  columns: GridColumn<T>[]
): string | null {
  const requiredCols = columns.filter((c) => c.required);
  const requiredOnInsertCols = columns.filter((c) => c.requiredOnInsert && !c.required);
  for (const row of rows) {
    if (row.__status === 'unchanged' || row.__status === 'delete') continue;
    for (const col of requiredCols) {
      const value = row[col.dataField];
      if (value === null || value === undefined || String(value).trim() === '') {
        return `${col.caption}을(를) 입력하세요.`;
      }
    }
    if (row.__status === 'insert') {
      for (const col of requiredOnInsertCols) {
        const value = row[col.dataField];
        if (value === null || value === undefined || String(value).trim() === '') {
          return `${col.caption}을(를) 입력하세요.`;
        }
      }
    }
  }
  return null;
}
