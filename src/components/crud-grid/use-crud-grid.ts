'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useGridModel, validateRows, type DataGridHandle, type GridColumn, type GridRow } from '@/components/data-grid';
import { useIsTabActive } from '@/features/menu-permission/hooks/use-tab-active';
import type { PagePerm } from '@/features/menu-permission/hooks/use-page-permission';

// key: 서버가 새로 부여한 키(예: auto-increment 코드)가 있으면 반환 — 생략하면 행의 keyField 값을 그대로 쓴다.
export type SaveResult = { ok: boolean; message?: string; key?: string };

export type CrudGridConfig<T extends Record<string, unknown>, F> = {
  keyField: keyof T & string;
  emptyRow: T | (() => T);
  columns: GridColumn<T>[];
  // usePagePermission(menuId)의 perm을 그대로 넘긴다 — 화면마다 컬럼에 editable: perm.edit을 일일이
  // 박아넣지 않아도, 여기서 컬럼별 editable/Insert·Delete 키/저장 API 호출까지 전부 자동으로 gate된다
  // (페이지에서 깜빡하고 빠뜨려서 권한 없이도 그리드 직접 편집이나 단축키로 CRUD가 되던 문제 때문에 추가됨).
  perm: PagePerm;
  initialFilters: F;
  // 화면에 보여줄 행을 고른다 — 추가(insert) 중인 행은 이 조건과 무관하게 항상 보여준다(hook이 알아서 처리).
  // listItems가 서버에서 이미 필터링된 목록을 받아온다면 생략해도 된다(기본: 전부 통과).
  matchesFilter?: (row: GridRow<T>, filters: F) => boolean;
  // 적용된 조회조건(appliedFilters)을 받는다 — 서버 쿼리 파라미터로 넘겨서 필터링하거나, 무시하고 전체를 반환해도 된다.
  listItems: (filters: F) => Promise<T[]>;
  createItem: (row: GridRow<T>) => Promise<SaveResult>;
  updateItem: (key: string, row: GridRow<T>) => Promise<SaveResult>;
  deleteItem: (key: string) => Promise<SaveResult>;
  // 저장 전에 키 필드 중복을 검사할 때 쓸 라벨(예: "모듈번호") — 생략하면 중복 검사를 하지 않는다.
  keyLabel?: string;
  onAfterSave?: () => void;
  onAfterDelete?: () => void;
  loadErrorMessage?: string;
  // 한 화면에 useCrudGrid를 두 개 이상 쓸 때(마스터-디테일), F3은 메인 그리드에서만 동작해야 한다 —
  // 디테일 쪽은 false로 꺼서 두 그리드가 동시에 저장/조회되는 것을 막는다. 기본 true.
  enableF3Shortcut?: boolean;
  // 새 행을 어디에 끼워 넣을지 — 'afterFocused'(기본)는 포커스된 행 바로 다음, 'end'는 항상 맨 뒤
  // (예: 우선순위/정렬 값이 있는 목록처럼 항상 끝에 붙는 게 자연스러운 경우).
  insertPosition?: 'afterFocused' | 'end';
};

// "메뉴관리 테스트"에서 만든 그리드 인라인 편집(추가/수정/삭제/저장, 한 번에 한 행 편집, 조회조건
// 스테이징, F3 컨텍스트 단축키) 패턴을 그대로 재사용하기 위한 공용 훅. 화면마다 다른 부분(컬럼,
// API 호출, 필터 조건)만 config로 넘기면 나머지 로직은 전부 여기서 처리한다.
export function useCrudGrid<T extends Record<string, unknown>, F>(config: CrudGridConfig<T, F>) {
  // 안 보이는 다른 탭(MDI 워크스페이스에서 hidden 처리된)에 이 훅이 마운트돼 있어도 F3이 거기서까지
  // 같이 반응하는 것을 막는다 — window 전역 리스너라 탭 가시성을 직접 체크해야 한다.
  const isTabActive = useIsTabActive();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // 조회조건 입력값(타이핑하는 동안 그대로)과 실제로 목록에 적용된 조건을 분리한다 — 조회 버튼
  // (또는 F3)을 눌러야 목록에 반영되고, 타이핑만으로는 목록이 바뀌지 않는다.
  const [liveFilters, setLiveFilters] = useState<F>(config.initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<F>(config.initialFilters);
  const gridRef = useRef<DataGridHandle>(null);
  const searchFormRef = useRef<HTMLDivElement>(null);

  const grid = useGridModel<T>(config.keyField);

  // perm.edit이 없으면 cellType이 있는 컬럼도 전부 읽기 전용으로 만든다 — col.editable을 명시적으로
  // false로 박아둔 컬럼(예: 항상 잠긴 필드)이나 cellType 자체가 없는 표시 전용 컬럼은 원래대로 그대로 둔다.
  const columns = useMemo(
    () =>
      config.columns.map((col) => ({
        ...col,
        editable: config.perm.edit && (col.editable ?? !!col.cellType),
      })),
    [config.columns, config.perm.edit]
  );

  // filtersOverride: setAppliedFilters 직후 곧바로 이어서 부를 때는(조회 버튼) 아직 반영되지 않은
  // appliedFilters 상태(클로저) 대신 이 값을 써야 방금 입력한 조회조건이 실제로 반영된다.
  async function loadItems(filtersOverride?: F) {
    setLoading(true);
    try {
      const items = await config.listItems(filtersOverride ?? appliedFilters);
      grid.loadRows(items);
    } catch {
      toast.error(config.loadErrorMessage ?? '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F3은 상황에 따라 다르게 동작한다: 조회조건 안에 포커스가 있으면 조회를, 그 외(그리드 편집 중
  // 등)에는 저장을 실행한다 — ref로 최신 함수를 참조해서 매 렌더마다 리스너를 다시 등록하지 않는다.
  const handleSaveAllRef = useRef<() => void>(() => {});
  const handleQueryRef = useRef<() => void>(() => {});
  const f3Enabled = config.enableF3Shortcut ?? true;
  useEffect(() => {
    if (!f3Enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!isTabActive) return;
      if (e.key === 'F3') {
        e.preventDefault();
        if (searchFormRef.current?.contains(document.activeElement)) {
          handleQueryRef.current();
        } else {
          handleSaveAllRef.current();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f3Enabled, isTabActive]);

  const filteredRows = grid.visibleRows.filter(
    (r) => r.__status === 'insert' || !config.matchesFilter || config.matchesFilter(r, appliedFilters)
  );

  const hasInsertRow = grid.rows.some((r) => r.__status === 'insert');
  const focusedRow = grid.rows.find((r) => r.__key === grid.focusedKey) ?? null;

  function handleAddRow() {
    if (!config.perm.add) return; // 추가 권한이 없으면 버튼이 막혀 있어도 Insert 키 등으로 우회할 수 없다.
    if (hasInsertRow) return; // 이미 추가 중인 행이 있으면 또 추가하지 않는다.
    const afterKey = config.insertPosition === 'end' ? null : grid.focusedKey;
    const emptyRow = typeof config.emptyRow === 'function' ? config.emptyRow() : config.emptyRow;
    const key = grid.addRow(emptyRow, afterKey);
    grid.setFocusedKey(key);
    requestAnimationFrame(() => gridRef.current?.focusFirstEditable(key));
    gridRef.current?.scrollToFocused();
  }

  function handleEditSelected() {
    if (!grid.focusedKey) return;
    gridRef.current?.focusFirstEditable(grid.focusedKey);
  }

  function handleQuery() {
    setAppliedFilters(liveFilters);
    loadItems(liveFilters);
  }
  handleQueryRef.current = handleQuery;

  // 조회조건이 화면 자체의 검색폼이 아니라 "다른 그리드에서 선택된 행" 같은 외부 상태로 바뀔 때 쓴다
  // (예: 고객을 고르면 그 고객의 프로젝트 목록을 다시 불러오는 마스터-디테일 화면).
  function setFiltersAndReload(filters: F) {
    setLiveFilters(filters);
    setAppliedFilters(filters);
    loadItems(filters);
  }

  function handleDeleteFocused() {
    if (!config.perm.del) return; // 삭제 권한이 없으면 버튼이 막혀 있어도 Delete 키로 우회할 수 없다.
    if (!focusedRow) return;
    setDeleteConfirmOpen(true);
  }

  // 삭제는 저장 버튼과 무관하게 확인 즉시 반영된다 — 추가 중이던(아직 저장 안 된) 행이면 로컬에서
  // 바로 제거하고, 이미 존재하는 행이면 그 자리에서 삭제 API를 호출한다.
  async function executeDelete() {
    const target = focusedRow;
    setDeleteConfirmOpen(false);
    if (!target || !config.perm.del) return;

    if (target.__status === 'insert') {
      grid.deleteRow(target.__key);
      grid.setFocusedKey(null);
      return;
    }

    setDeleting(true);
    try {
      const result = await config.deleteItem(target.__key);
      if (result.ok) {
        toast.success('삭제했습니다.');
      } else {
        toast.error(result.message ?? '삭제에 실패했습니다.');
      }
      grid.setFocusedKey(null);
      await loadItems();
      config.onAfterDelete?.();
    } catch {
      toast.error('서버에 연결할 수 없습니다.');
    } finally {
      setDeleting(false);
    }
  }

  // 키 필드를 수정할 수 있게 열어둔 화면에서는(예: 모듈번호), 화면에 보이는 행들끼리 서로 겹치는지
  // 저장 전에 미리 확인한다. 실제 DB와의 충돌은 서버에서 최종적으로 막는다.
  function findDuplicateKeyConflict(): string | null {
    if (!config.keyLabel) return null;
    const keysById = new Map<string, string[]>();
    for (const row of grid.visibleRows) {
      const id = String(row[config.keyField] ?? '').trim();
      if (!id) continue;
      const keys = keysById.get(id) ?? [];
      keys.push(row.__key);
      keysById.set(id, keys);
    }
    for (const [id, keys] of keysById) {
      if (keys.length > 1) return `${config.keyLabel} "${id}"가 이미 존재합니다.`;
    }
    return null;
  }

  async function handleSaveAll() {
    if (saving) return;
    const validationError = validateRows(grid.changedRows, columns);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (grid.changedRows.length === 0) return;
    const dupError = findDuplicateKeyConflict();
    if (dupError) {
      toast.error(dupError);
      return;
    }

    gridRef.current?.closeEditing(); // 저장 후 rows가 통째로 새로고침되므로, 열려있던 편집칸을 먼저 정리한다.
    setSaving(true);
    try {
      const changed = grid.changedRows;
      const results = await Promise.all(
        changed.map((row): Promise<SaveResult> => {
          // 그리드 컬럼 editable이 perm.edit으로 이미 막혀있어도, Enter로 편집을 열고 저장을 트리거하는
          // 경로까지 우회할 수 없도록 실제 API 호출 직전에도 한 번 더 막는다(방어적 이중 체크).
          if (row.__status === 'insert') {
            if (!config.perm.add) return Promise.resolve({ ok: false, message: '추가 권한이 없습니다.' });
            return config.createItem(row);
          }
          if (row.__status === 'update') {
            if (!config.perm.edit) return Promise.resolve({ ok: false, message: '수정 권한이 없습니다.' });
            return config.updateItem(row.__key, row);
          }
          // delete (즉시삭제 방식이라 보통 여기 도달하지 않지만, 방어적으로 남겨둔다)
          if (!config.perm.del) return Promise.resolve({ ok: false, message: '삭제 권한이 없습니다.' });
          return config.deleteItem(row.__key);
        })
      );

      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(`저장했습니다 (${results.length}건).`);
      } else {
        toast.error(`${failed.length}건 저장 실패: ${failed[0].message ?? ''}`);
      }

      // 저장 후 목록을 다시 불러오면 정렬 등으로 순서가 바뀔 수 있는데, 방금 추가/수정한 행에
      // 계속 포커스가 남아있도록 그 행의 최종 키(서버가 새로 부여했을 수도 있음)를 찾아둔다.
      let nextFocusKey: string | null = null;
      for (let i = changed.length - 1; i >= 0; i--) {
        const row = changed[i];
        if (row.__status === 'delete' || !results[i].ok) continue;
        nextFocusKey = results[i].key ?? String(row[config.keyField]);
        break;
      }

      await loadItems();
      grid.setFocusedKey(nextFocusKey);
      if (nextFocusKey) gridRef.current?.scrollToFocused();
      config.onAfterSave?.();
    } catch {
      toast.error('서버에 연결할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  }
  handleSaveAllRef.current = handleSaveAll;

  return {
    grid,
    gridRef,
    searchFormRef,
    // perm.edit이 반영된 컬럼 목록 — DataGrid에는 항상 이걸 넘겨야 그리드 직접 편집이 권한과 맞물린다.
    columns,
    loading,
    saving,
    deleting,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    liveFilters,
    setLiveFilters,
    appliedFilters,
    filteredRows,
    hasInsertRow,
    focusedRow,
    handleAddRow,
    handleEditSelected,
    handleDeleteFocused,
    executeDelete,
    handleSaveAll,
    handleQuery,
    setFiltersAndReload,
    reload: loadItems,
  };
}
