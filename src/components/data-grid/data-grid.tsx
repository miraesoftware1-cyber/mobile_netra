'use client';

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, Check } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import type { GridColumn, GridRow } from './types';
import { isCellEditable } from './types';
import { useIsTabActive } from '@/features/menu-permission/hooks/use-tab-active';

type EditingCell = { key: string; field: string };

export type DataGridHandle = {
  // 그리드 밖(툴바 버튼 등)에서 특정 행의 첫 편집 가능 칸을 바로 편집 모드로 만든다. 다른 행이
  // 편집 중이었다면 그 행은 먼저 편집 시작 시점 값으로 되돌아간다(추가 중이던 행은 삭제된다).
  focusFirstEditable: (key: string) => void;
  // 저장 등으로 rows가 통째로 새로고침될 때, 남아있는 편집 세션 상태를 정리한다
  // (안 하면 저장 후에도 입력칸이 그대로 남아있거나, 다음 클릭 동작이 이전 세션 기준으로 뒤섞인다).
  closeEditing: () => void;
  // 헬프 피커에서 값을 고른 직후처럼, 특정 칸을 편집 모드로 다시 열어야 할 때 쓴다 — 피커 다이얼로그가
  // 뜨면서 포커스를 가져가 버려 편집 세션이 blur로 닫히기 때문에, 고른 값을 넣은 뒤 다시 열어줘야 한다.
  startEditField: (key: string, field: string) => void;
  // 지금 포커스된 행이 보이도록 화면 가운데쯤으로 스크롤한다 — 추가/저장 직후처럼 명시적으로 불러야
  // 동작한다(단순 클릭 선택마다 자동으로 스크롤되면 오히려 산만해서 자동으로는 안 하게 해뒀다).
  scrollToFocused: () => void;
  // 그리드 밖(예: 화면 제목의 "전체 형태 기억" 메뉴)에서 이 그리드의 형태기억을 프로그래밍적으로
  // 호출할 때 쓴다 — 우클릭 메뉴의 같은 이름 버튼과 동일하게 동작한다.
  rememberLayout: () => void;
  resetLayout: () => void;
  rememberMasterLayout: () => void;
  resetMasterLayout: () => void;
  // 이 사용자가 그리드 마스터인지 — 화면 제목 쪽 메뉴에서 마스터 전용 항목을 보여줄지 판단할 때 쓴다.
  isMaster: boolean;
};

type DataGridProps<T extends Record<string, unknown>> = {
  columns: GridColumn<T>[];
  rows: GridRow<T>[];
  focusedKey?: string | null;
  // null을 넘기면 포커스된 행이 없는 상태로 만든다(예: Esc로 조회조건 영역으로 나갈 때).
  onFocusedRowChanged?: (key: string | null) => void;
  onCellChange: (key: string, field: keyof T, value: unknown) => void;
  onCancelNewRow?: (key: string) => void;
  onRequestSave?: () => void;
  // 편집 중이던 행을 두고 다른 행으로 넘어갈 때, 그 행 전체를 편집 시작 시점 값으로 되돌린다.
  onRevertRow?: (key: string, snapshot: GridRow<T>) => void;
  // 행에 포커스가 있고 편집 중이 아닐 때: Insert 키 -> 추가, Delete 키 -> 포커스된 행 삭제 요청.
  onRequestInsertRow?: () => void;
  onRequestDeleteRow?: () => void;
  // cellType='help'인 칸에서 "?" 버튼을 누르면 호출된다 — 화면 쪽에서 알맞은 HELP 피커를 열고,
  // 선택되면 onCellChange로 값을 넣어주면 된다.
  onOpenHelpPicker?: (row: GridRow<T>, col: GridColumn<T>) => void;
  // 포커스된 행 배경색. 한 화면에 그리드 두 개를 나란히 쓸 때(마스터-디테일) 서로 다른 색을 줘서
  // 지금 어느 그리드가 선택돼 있는지 한눈에 구분되게 한다. 기본은 진한 파란색.
  focusRowColorClass?: string;
  // 포커스된 칸 테두리 색 — 배경색이 진해지면서 원래 연한 구분선이 안 보이는 것을 막는다. 'ring-...'
  // 형태의 Tailwind 클래스여야 한다(border-width가 아니라 ring/box-shadow를 쓰는 이유는 위 참고).
  focusBorderColorClass?: string;
  // 행 종류에 따라 배경색을 다르게 주고 싶을 때(예: 사용자관리에서 그룹 행을 구분) — 포커스/신규/수정
  // 표시보다는 낮은 우선순위로 적용된다. undefined를 반환하면 기본 지브라 배경을 그대로 쓴다.
  getRowAccentClass?: (row: GridRow<T>) => string | undefined;
  // 행 데이터에 따라 글자 색을 다르게 주고 싶을 때(예: 상태값에 따른 강조) — 셀 배경(getRowAccentClass)과
  // 달리 포커스/신규/수정 배경 위에서도 항상 적용된다. 텍스트를 실제로 그리는 안쪽 div에 직접
  // 클래스를 붙이므로, 읽기 전용 칸의 기본 text-muted-foreground보다 항상 우선한다.
  getRowTextClass?: (row: GridRow<T>) => string | undefined;
  // 화면에 그리드가 여러 개 있을 때, 지금 "활성" 그리드가 아니면 방향키/Insert/Delete 키보드
  // 단축키를 무시한다 — 안 그러면 오른쪽 행에 포커스가 있어도 왼쪽 그리드가 같이 반응해버린다. 기본 true.
  isActive?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  // 체크박스로 여러 행을 골라 일괄 삭제하는 화면(예: 권한관리)에서만 쓴다 — 있으면 맨 앞에
  // 전체선택 헤더 체크박스 + 행별 체크박스 컬럼이 추가된다. 단일 focusedKey 선택과는 별개다.
  selection?: {
    selectedKeys: Set<string>;
    onToggleRow: (key: string) => void;
    onToggleAll: () => void;
    allSelected: boolean;
    someSelected: boolean;
  };
  // 왼쪽 끝부터 이 개수만큼의 컬럼은 가로 스크롤해도 고정되고, 그 오른쪽 컬럼들만 스크롤된다
  // (선택 체크박스 컬럼이 있으면 그 다음부터). 특정 컬럼 이름이 아니라 "현재 화면상 순서 기준으로
  // 앞에서 N개"이므로, 헤더 드래그로 컬럼 순서를 바꿔도 고정 범위는 항상 맨 앞 N개 그대로 유지된다
  // (컬럼명 기준이면 그 컬럼을 뒤로 옮겼을 때 고정 범위가 같이 늘어나 버린다). 컬럼 실제 렌더 폭을
  // 재서 고정 위치를 계산하므로 widthClass 유무와 무관하게 동작한다.
  stickyColumnCount?: number;
  // 한 화면에 그리드가 여러 개 있을 때(마스터-디테일 등) 컬럼 폭 기억을 그리드별로 따로 저장하기
  // 위한 구분자. 화면당 그리드가 하나뿐이면 안 줘도 된다(기본 'default').
  gridId?: string;
  // 행이 포커스된 상태(편집 중은 아님)에서 Esc를 누르면 이 ref가 감싸는 영역의 첫 입력 칸으로
  // 포커스를 옮긴다(보통 조회조건 영역 — useCrudGrid의 searchFormRef를 그대로 넘기면 된다).
  searchFormRef?: React.RefObject<HTMLElement | null>;
  // 지정한 컬럼에서, 위 행과 값이 같으면 그 칸을 안 그리고 위 칸을 rowSpan으로 늘려 시각적으로
  // 하나로 합친다(예: "구분" 컬럼이 연속으로 같은 값이면 세로로 병합해서 한 번만 보여줌). 편집 중인
  // 행이나 아직 저장 전(insert)인 행은 병합 대상에서 제외한다 — 그 행 자신의 칸이 항상 그려져야
  // 편집기가 정상적으로 뜬다.
  mergeColumns?: (keyof T & string)[];
};

// 셀이 읽기 모드든 편집 모드든 이 높이로 고정 — 편집칸에 들어갈 때 행 높이가 들쑥날쑥해지는 것을 막는다.
const CELL_HEIGHT = 'h-9';

function alignClass(align?: 'left' | 'center' | 'right') {
  return align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left';
}

// DB 컬럼(varchar, Korean_Wansung_CI_AS 콜레이션)은 한글을 2바이트로 저장한다.
// maxLength는 "글자 수"가 아니라 이 바이트 기준으로 넘는지 검사해야
// varchar(1) 같은 좁은 컬럼에 한글 1글자를 넣어도 "String or binary data would be truncated"가 안 난다.
function byteLength(str: string): number {
  let len = 0;
  for (const ch of str) {
    len += ch.codePointAt(0)! > 0x7f ? 2 : 1;
  }
  return len;
}

// tr 배경은 각 td가 자기 배경을 다시 칠해서 덮어버리므로(border-collapse), 셀 단위로 배경을
// 결정한다. 우선순위: 포커스된 행 > 신규/수정 표시 > 행 종류별 강조색(accentClass) > 짝/홀수 구분(지브라) > 편집 가능 여부.
// 전부 완전 불투명 색만 쓴다 — 반투명을 쓰면 스크롤 고정(sticky) 칸에서 뒤에 깔린 다른 칸의 글자가
// 비쳐 보이고, sticky 칸만 골라 불투명하게 바꾸면 이번엔 그 칸만 색이 달라 보인다(둘 다 실제로
// 겪은 문제). 아래 옅은 색들은 --muted(220 27.3% 95.7%)를 --card(흰색) 위에 15/25/40%로 얹었을 때
// 나오는 결과색을 미리 계산해 고정값으로 넣은 것이라, sticky 여부와 무관하게 항상 똑같이 보인다.
// --muted/--card 값이 바뀌면 이 값들도 다시 계산해야 한다.
function cellBgClass(
  status: string,
  isFocused: boolean,
  zebra: boolean,
  editable: boolean,
  focusColorClass: string,
  accentClass?: string
): string {
  if (isFocused) return focusColorClass;
  if (status === 'insert') return 'bg-green-50';
  if (status === 'update') return 'bg-amber-50';
  if (accentClass) return accentClass;
  if (editable) return zebra ? 'bg-[#fdfdfe]' : 'bg-card';
  return zebra ? 'bg-[#f9fafc]' : 'bg-[#fcfcfd]';
}

type SortableColumnHeaderProps<T extends Record<string, unknown>> = {
  col: GridColumn<T>;
  displayCaption: string;
  stickyLeft: number | undefined;
  width: number | undefined;
  layoutFixed: boolean;
  isEditableCol: boolean;
  isLastSticky: boolean;
  isVeryLastCol: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent, field: string, currentWidth: number) => void;
};

// 헤더 칸을 드래그해서 컬럼 순서를 바꾼다 — 탭 드래그(TabBar)와 같은 dnd-kit 패턴. useSortable은
// 훅이라 columns.map 콜백 안에서 바로 호출할 수 없고(같은 컴포넌트에서 반복 호출하면 훅 규칙 위반),
// 컬럼 하나당 별도 컴포넌트 인스턴스로 분리해야 한다.
function SortableColumnHeader<T extends Record<string, unknown>>({
  col,
  displayCaption,
  stickyLeft,
  width,
  layoutFixed,
  isEditableCol,
  isLastSticky,
  isVeryLastCol,
  onContextMenu,
  onResizeStart,
}: SortableColumnHeaderProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.dataField });

  return (
    <th
      ref={setNodeRef}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
      className={`relative text-center px-3 py-2.5 font-semibold sticky top-0 bg-muted border-b border-border touch-none ${
        stickyLeft !== undefined ? 'z-20' : 'z-10'
      } ${col.fixedWidth ? 'truncate' : 'whitespace-nowrap'} ${col.widthClass ?? ''} ${
        isEditableCol ? 'text-foreground' : 'text-muted-foreground'
      }`}
      style={{
        ...(stickyLeft !== undefined ? { left: stickyLeft } : undefined),
        // maxWidth도 width와 같이 줘서 컬럼이 항상 지정된 폭 그대로 고정되게 한다 — 컬럼폭
        // 합이 컨테이너보다 좁아져도 다른 컬럼이 늘어나 채우지 않고, 대신 오른쪽에 빈 공간이
        // 남는다(의도된 동작. 그 경계는 위 isVeryLastCol 구분선으로 표시한다).
        ...(layoutFixed && width ? { width, minWidth: width, maxWidth: width } : undefined),
        // border-r 유틸은 tr의 divide-x가 모든 셀에 border-right-width:0을 더 높은 우선순위로
        // 강제하는 바람에 먹히지 않는다 — box-shadow는 divide-x와 무관한 별개 속성이라
        // 항상 그려지고, 레이아웃 폭에도 영향을 안 준다. 다른 구분선(border-border)과 같은
        // 굵기·색으로 보이도록 맞춘다.
        ...(isLastSticky || isVeryLastCol ? { boxShadow: '1px 0 0 0 hsl(var(--border))' } : undefined),
        // CSS.Transform은 scaleX/scaleY까지 포함해서, 폭이 서로 다른 컬럼끼리 자리를 바꿀 때
        // dnd-kit이 드래그 중인 헤더를 가로로 찌그러뜨려(scaleX) 글자가 눌려 보이게 만든다.
        // 컬럼 폭은 이미 위 width로 고정해뒀으니 이동(translate)만 적용한다.
        transform: CSS.Translate.toString(transform),
        transition,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {displayCaption}
      {(col.required || col.requiredOnInsert) ? <span className="text-destructive"> *</span> : null}
      {/* 헤더 구분선 드래그로 폭 조절 — 우클릭하면 "형태 기억"/"원래 형태로" 메뉴가 뜬다. onPointerDown에서
          전파를 멈춰야 이 손잡이를 잡고 늘릴 때 th 전체의 컬럼 순서 드래그가 같이 반응하지 않는다. */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => onResizeStart(e, col.dataField, width ?? e.currentTarget.parentElement!.getBoundingClientRect().width)}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 select-none z-10"
      />
    </th>
  );
}

function DataGridInner<T extends Record<string, unknown>>(
  {
    columns,
    rows,
    focusedKey,
    onFocusedRowChanged,
    onCellChange,
    onCancelNewRow,
    onRequestSave,
    onRevertRow,
    onRequestInsertRow,
    onRequestDeleteRow,
    onOpenHelpPicker,
    focusRowColorClass = 'bg-blue-100',
    focusBorderColorClass = 'ring-blue-200',
    getRowAccentClass,
    getRowTextClass,
    isActive = true,
    loading,
    emptyMessage = '데이터가 없습니다',
    selection,
    stickyColumnCount,
    gridId,
    searchFormRef,
    mergeColumns,
  }: DataGridProps<T>,
  ref: React.ForwardedRef<DataGridHandle>
) {
  // 지금 이 그리드가 속한 탭이 화면에 실제로 보이는 탭인지 — 안 보이는 탭(MDI 워크스페이스에서 hidden
  // 처리된 다른 탭)에서도 전역 키보드 리스너가 그대로 반응하는 것을 막는다.
  const isTabActive = useIsTabActive();
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // 헤더 드래그로 바꾼 컬럼 순서 — null이면 columns prop에 정의된 코드 기본 순서 그대로다. 저장된
  // 저장된 order에 없는 새 컬럼은 코드 정의 순서 기준으로 가장 가까운 이웃 뒤에 끼워넣는다.
  // 예: 코드 순서가 [A, B, C, D]이고 저장 순서가 [C, A]일 때 B는 A 뒤, D는 C 뒤에 삽입된다.
  const [order, setOrder] = useState<string[] | null>(null);
  const orderedColumns = useMemo(() => {
    if (!order) return columns;
    const byField = new Map(columns.map((c) => [c.dataField, c] as const));
    const result: GridColumn<T>[] = order.map((f) => byField.get(f)).filter((c): c is GridColumn<T> => !!c);
    const missing = columns.filter((c) => !order.includes(c.dataField));
    for (const col of missing) {
      const codeIdx = columns.indexOf(col);
      // 코드 순서상 이 컬럼보다 앞에 있으면서 result에 이미 들어간 컬럼 중 가장 마지막 것을 찾는다.
      let insertAfter = -1;
      for (let i = codeIdx - 1; i >= 0; i--) {
        const pos = result.findIndex((r) => r.dataField === columns[i].dataField);
        if (pos !== -1) { insertAfter = pos; break; }
      }
      result.splice(insertAfter + 1, 0, col);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, order]);

  // 우클릭 메뉴로 숨긴 컬럼 — 순서(order)와는 별개로 관리한다(숨겼다 다시 보이면 원래 자리 그대로
  // 나오게). orderedColumns는 숨김 여부와 무관하게 전체 컬럼(숨긴 목록을 보여줄 때 필요), 실제
  // 렌더링은 항상 visibleColumns 기준이다.
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const visibleColumns = useMemo(
    () => orderedColumns.filter((c) => !hiddenColumns.has(c.dataField)),
    [orderedColumns, hiddenColumns]
  );

  // 가로 스크롤 고정 컬럼 — 컬럼별 widthClass가 없을 수도 있어서, 헤더 칸을 실제로 렌더링한 뒤
  // 그 폭을 재서 각 고정 컬럼의 left 값을 계산한다(두 번째 렌더에서 반영되지만 사람 눈에는 안 보임).
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const [stickyLefts, setStickyLefts] = useState<Record<string, number>>({});
  // 코드 기본값(stickyColumnCount prop)에서 시작하되, 형태기억(개인/마스터)에 저장된 값이 있으면
  // 그 값으로 덮어써야 하므로 별도 state로 관리한다 — 헤더 우클릭 메뉴로도 즉시 바꿀 수 있다(폭
  // 드래그와 동일하게, 실제 저장은 "형태 기억"/"마스터로 저장"을 눌러야 반영된다).
  const [stickyCount, setStickyCount] = useState<number>(stickyColumnCount ?? 0);
  // 컬럼명이 아니라 "현재 순서 기준(숨긴 컬럼 제외) 앞에서 N개"이므로, 드래그로 순서를 바꾸거나
  // 컬럼을 숨겨도 항상 화면에 실제로 보이는 맨 앞 N개가 고정된다.
  const stickyUntilIndex = stickyCount > 0 ? Math.min(stickyCount, visibleColumns.length) - 1 : -1;

  // 컬럼 폭 상태 — sticky 위치 재계산 effect가 이 값을 deps로 참조하므로 그보다 앞서 선언한다.
  const [widths, setWidths] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    if (stickyUntilIndex === -1 || !headerRowRef.current) {
      setStickyLefts({});
      return;
    }
    const cells = Array.from(headerRowRef.current.children) as HTMLElement[];
    const dataCellStart = selection ? 1 : 0;
    let acc = selection ? cells[0].offsetWidth : 0;
    const next: Record<string, number> = {};
    for (let i = 0; i <= stickyUntilIndex; i++) {
      next[visibleColumns[i].dataField] = acc;
      acc += cells[dataCellStart + i]?.offsetWidth ?? 0;
    }
    setStickyLefts(next);
    // widths를 deps에 넣어야 헤더 구분선 드래그로 폭을 바꾼 뒤에도 뒤따르는 컬럼들의 sticky 위치가
    // 다시 계산된다 — 안 그러면 sticky 컬럼 폭을 줄였을 때 그 뒤 컬럼이 예전(넓었을 때) 위치에 남아
    // sticky 컬럼에 가려 보인다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickyUntilIndex, !!selection, visibleColumns, rows.length, widths]);

  // 컬럼 폭 기억/수정 — 헤더 구분선을 드래그해서 폭을 바꾸고, 우클릭 메뉴로 "형태 기억"(현재 폭을
  // 이 사용자·이 화면·이 그리드 기준으로 저장)/"원래 형태로"(코드에 정의된 기본 폭으로 되돌리고
  // 저장된 것도 지운다)를 할 수 있다. menu_id는 URL 경로에서 자동으로 뽑아내므로 화면마다 따로
  // 설정할 필요는 없고, 한 화면에 그리드가 여러 개면 gridId prop으로만 구분해주면 된다.
  const pathname = usePathname();
  const menuId = pathname?.split('/').filter(Boolean).pop() ?? '';
  const gridIdKey = gridId ?? 'default';
  const [layoutFixed, setLayoutFixed] = useState(false);
  const defaultWidthsRef = useRef<Record<string, number>>({});
  const resizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; colIndex: number; dataField: string } | null>(null);
  // 이 사용자가 그리드 마스터인지 — 마스터일 때만 우클릭 메뉴에 "마스터로 저장"이 노출된다.
  const [isMaster, setIsMaster] = useState(false);
  // 마스터가 바꾼 헤더 이름(전역 설정, 모든 사용자에게 적용) — dataField -> 오버라이드된 캡션.
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [renamingField, setRenamingField] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // 컬럼별 셀 내용 정렬 오버라이드(헤더 텍스트 정렬은 안 바뀜) — dataField -> 'left'|'center'|'right'.
  const [columnAlignOverride, setColumnAlignOverride] = useState<Record<string, 'left' | 'center' | 'right'>>({});

  // 최초 1회만(로딩이 끝나 실제 데이터가 렌더된 뒤) 실제 렌더된(코드 기본 widthClass 기준) 폭을 재서
  // 이후 table-layout:fixed 전환 시 컬럼들이 동일 폭으로 뭉개지지 않게 시드값으로 쓴다 — "원래 형태로"도
  // 이 값으로 되돌아간다. loading 중(행이 아직 안 불러와진 상태)에 재면 widthClass 없는 컬럼은 헤더
  // 글자 폭만으로 좁게 굳어버리므로, 로딩이 끝날 때까지 기다린다.
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (layoutFixed || loading || hasSeededRef.current || !headerRowRef.current) return;
    hasSeededRef.current = true;
    const cells = Array.from(headerRowRef.current.children) as HTMLElement[];
    const dataCellStart = selection ? 1 : 0;
    const next: Record<string, number> = {};
    visibleColumns.forEach((col, i) => {
      next[col.dataField] = cells[dataCellStart + i]?.offsetWidth ?? 100;
    });
    defaultWidthsRef.current = next;
    // 서버에서 불러온 저장된 폭(레이아웃 fetch effect)이 이 시딩보다 먼저 도착해 있을 수도 있다 —
    // 그럴 땐 그 값이 우선해야 한다. setWidths(next)로 통째로 덮어쓰면 이미 로드된 저장값이
    // 그 순간 사라지고 방금 측정한 기본값으로 되돌아가 버린다(실제로 재현된 레이스 컨디션).
    setWidths((prev) => ({ ...next, ...prev }));
    setLayoutFixed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // 저장된 폭/순서/스티키개수가 있으면 불러와서 기본값 위에 덮어쓴다 — 개인 설정이 없으면 서버가
  // 마스터 설정을, 그것도 없으면 null(코드 기본값 유지)을 내려준다(3단계 해석은 API에서 처리).
  async function fetchLayout() {
    if (!menuId) return;
    try {
      const res = await fetch(`/api/grid-layout?menuId=${encodeURIComponent(menuId)}&gridId=${encodeURIComponent(gridIdKey)}`);
      const data = await res.json();
      if (!data?.ok) return;
      if (data.widths) setWidths((prev) => ({ ...prev, ...data.widths }));
      setOrder(Array.isArray(data.order) && data.order.length > 0 ? data.order : null);
      if (typeof data.stickyColumnCount === 'number') setStickyCount(data.stickyColumnCount);
      if (Array.isArray(data.hiddenColumns)) setHiddenColumns(new Set(data.hiddenColumns));
      setIsMaster(!!data.isMaster);
      setColumnLabels(data.columnLabels && typeof data.columnLabels === 'object' ? data.columnLabels : {});
      setColumnAlignOverride(data.columnAlign && typeof data.columnAlign === 'object' ? data.columnAlign : {});
    } catch {
      // 무시 — 코드 기본값 그대로 유지
    }
  }
  useEffect(() => {
    fetchLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId, gridIdKey]);

  function startResize(e: React.MouseEvent, field: string, currentWidth: number) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { field, startX: e.clientX, startWidth: currentWidth };
    function onMouseMove(ev: MouseEvent) {
      const r = resizingRef.current;
      if (!r) return;
      const next = Math.max(40, r.startWidth + (ev.clientX - r.startX));
      setWidths((prev) => ({ ...prev, [r.field]: next }));
    }
    function onMouseUp() {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  async function rememberLayout() {
    setContextMenu(null);
    if (!menuId) return;
    await fetch('/api/grid-layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuId,
        gridId: gridIdKey,
        widths,
        order: orderedColumns.map((c) => c.dataField),
        stickyColumnCount: stickyCount,
        hiddenColumns: Array.from(hiddenColumns),
        columnAlign: columnAlignOverride,
      }),
    }).catch(() => {});
  }

  // 마스터 전용 — 이 화면/그리드를 쓰는 모든 사용자의 기본값(코드 기본값보다 우선, 개인 설정보다는 하위)으로 저장.
  async function rememberMasterLayout() {
    setContextMenu(null);
    if (!menuId) return;
    await fetch('/api/grid-layout/master', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuId,
        gridId: gridIdKey,
        widths,
        order: orderedColumns.map((c) => c.dataField),
        stickyColumnCount: stickyCount,
        hiddenColumns: Array.from(hiddenColumns),
        columnAlign: columnAlignOverride,
      }),
    }).catch(() => {});
  }

  async function resetLayout() {
    setContextMenu(null);
    if (!menuId) return;
    await fetch(`/api/grid-layout?menuId=${encodeURIComponent(menuId)}&gridId=${encodeURIComponent(gridIdKey)}`, {
      method: 'DELETE',
    }).catch(() => {});
    // 개인 설정만 지우고 다시 조회한다 — 마스터 설정이 있으면 그걸로, 없으면 코드 기본값으로
    // 자연스럽게 떨어진다(한 단계만 되돌아가는 동작, API의 3단계 해석 로직을 그대로 재사용).
    setWidths(defaultWidthsRef.current);
    setOrder(null);
    setStickyCount(stickyColumnCount ?? 0);
    setHiddenColumns(new Set());
    await fetchLayout();
  }

  // 마스터 전용 — 마스터 설정 자체를 지워서 코드 기본값으로 되돌린다. "원래 형태로"는 개인 설정만
  // 지우기 때문에, 마스터 설정 자체가 잘못됐을 때(예: 실수로 열을 숨긴 채 저장) 이걸로 되돌려야 한다.
  async function resetMasterLayout() {
    setContextMenu(null);
    if (!menuId) return;
    await fetch(`/api/grid-layout/master?menuId=${encodeURIComponent(menuId)}&gridId=${encodeURIComponent(gridIdKey)}`, {
      method: 'DELETE',
    }).catch(() => {});
    // 코드 기본값으로 먼저 되돌린 뒤 다시 조회한다 — 마스터를 지운 본인이 따로 개인 설정을
    // 갖고 있었다면(resetLayout과 동일한 이유로) 그게 여전히 우선 적용된다.
    setWidths(defaultWidthsRef.current);
    setOrder(null);
    setStickyCount(stickyColumnCount ?? 0);
    setHiddenColumns(new Set());
    await fetchLayout();
  }

  // 마스터 전용 — 헤더 이름은 컬럼명 오버라이드(전역, web_user_setting)로 저장돼 모든 사용자에게
  // 즉시 반영된다. 형태기억(폭/순서/스티키/숨김)과는 별개 경로라 "형태 기억"을 안 눌러도 바로 저장된다.
  function startRenameColumn() {
    if (!contextMenu || !menuId) return;
    const current = columnLabels[contextMenu.dataField] ?? visibleColumns[contextMenu.colIndex]?.caption ?? '';
    setRenamingField(contextMenu.dataField);
    setRenameValue(current);
  }

  async function commitRenameColumn() {
    if (!renamingField || !menuId) return;
    const dataField = renamingField;
    const label = renameValue.trim();
    setRenamingField(null);
    setContextMenu(null);
    if (!label) return;
    setColumnLabels((prev) => ({ ...prev, [dataField]: label }));
    await fetch('/api/grid-layout/column-label', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuId, gridId: gridIdKey, dataField, label }),
    }).catch(() => {});
  }

  async function resetColumnLabelToDefault() {
    if (!contextMenu || !menuId) return;
    const dataField = contextMenu.dataField;
    setContextMenu(null);
    setColumnLabels((prev) => {
      const next = { ...prev };
      delete next[dataField];
      return next;
    });
    await fetch(
      `/api/grid-layout/column-label?menuId=${encodeURIComponent(menuId)}&gridId=${encodeURIComponent(gridIdKey)}&dataField=${encodeURIComponent(dataField)}`,
      { method: 'DELETE' }
    ).catch(() => {});
  }

  // 헤더 텍스트가 아니라 그 컬럼의 본문 셀 내용 정렬만 바꾼다. 폭/순서/스티키/숨김열과 동일하게
  // 로컬 상태만 즉시 바꾸고, 실제 저장은 "형태 기억"/"(마스터)형태 기억"을 눌러야 반영된다.
  function setColumnAlign(align: 'left' | 'center' | 'right') {
    if (!contextMenu) return;
    setColumnAlignOverride((prev) => ({ ...prev, [contextMenu.dataField]: align }));
    setContextMenu(null);
  }

  function setStickyUntilHere() {
    if (!contextMenu) return;
    setStickyCount(contextMenu.colIndex + 1);
    setContextMenu(null);
  }

  function hideCurrentColumn() {
    if (!contextMenu || visibleColumns.length <= 1) return;
    setHiddenColumns((prev) => new Set(prev).add(contextMenu.dataField));
    setContextMenu(null);
  }

  // 컬럼 헤더가 아니라 행/빈 공간에서 우클릭했을 때 — "형태 기억"/"원래 형태로"(+마스터 버전)만 보여준다.
  // colIndex/dataField가 없는 특수 상태로 열어서, 컬럼 전용 항목(스티키/정렬/숨기기/이름바꾸기)은
  // 렌더링 쪽에서 자동으로 숨겨진다. 편집 중인 입력창 위에서는 브라우저 기본 메뉴(복사/붙여넣기)가
  // 그대로 떠야 하므로 가로챈다.
  function handleGridContextMenu(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, colIndex: -1, dataField: '' });
  }

  function showColumn(field: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
    setContextMenu(null);
  }

  function clearStickyColumns() {
    setStickyCount(0);
    setContextMenu(null);
  }

  // 헤더 드래그로 컬럼 순서를 바꾼다 — 폭 리사이즈처럼 드래그 즉시 화면에는 반영되지만, 서버에는
  // "형태 기억"을 눌러야 저장된다(rememberLayout).
  function handleColumnDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const currentOrder = orderedColumns.map((c) => c.dataField);
    const oldIndex = currentOrder.indexOf(String(active.id));
    const newIndex = currentOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setOrder(arrayMove(currentOrder, oldIndex, newIndex));
  }

  // 드래그는 살짝 눌러서 움직여야만 시작되게(activationConstraint) — 안 그러면 헤더 클릭(정렬 등 다른
  // 상호작용은 없지만 우클릭 메뉴/리사이즈와 헷갈리지 않도록)이 매번 드래그로 오인식된다.
  const columnSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!contextMenu) return;
    function onDocClick() {
      setContextMenu(null);
    }
    window.addEventListener('click', onDocClick);
    window.addEventListener('scroll', onDocClick, true);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onDocClick, true);
    };
  }, [contextMenu]);
  // startEditField가 requestAnimationFrame으로 미뤄 실행될 때, 그 사이 다른 곳(예: 헬프 피커 선택)에서
  // updateCell로 값이 막 바뀐 최신 rows를 봐야 하므로 클로저 대신 항상 최신인 ref를 따로 둔다.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // scrollToFocused가 나중에(rAF) 실행될 때 최신 focusedKey를 보려고 별도 ref로도 들고 있는다.
  const focusedKeyRef = useRef(focusedKey);
  focusedKeyRef.current = focusedKey;
  // 포커스된 행으로 스크롤은 "추가/저장 직후"처럼 명시적으로 요청했을 때만 한다 — 단순 클릭 선택마다
  // 화면 가운데로 확 튀면 오히려 산만하므로, tr마다 자동으로 scrollIntoView하지 않고 이 맵에 엘리먼트만 담아둔다.
  const rowElsRef = useRef<Map<string, HTMLTableRowElement>>(new Map());
  // 지금 편집 세션이 열려있는 행과, 그 세션이 시작된 시점의 행 전체 스냅샷(다른 행으로 넘어갈 때
  // 이 스냅샷으로 통째로 되돌린다). 이미 커밋해둔 다른 칸의 변경도 포함해서 되돌아간다 — 그래서
  // "이 행은 끝났다"는 뜻으로 다른 행을 클릭하면, 그 행에서 하던 편집은 전부 취소된다.
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [rowSnapshot, setRowSnapshot] = useState<GridRow<T> | null>(null);
  // Esc를 누르면 "지금 편집 중인 이 칸"만 편집 시작 시점 값으로 되돌린다 (행 전체가 아니라).
  const [fieldSnapshot, setFieldSnapshot] = useState<{ key: string; field: string; value: unknown } | null>(null);

  // mergeColumns 병합 계산 — 연속으로 같은 값인 구간의 첫 행("anchor")에만 rowSpan 개수를 기록하고,
  // 나머지 행은 covered로 표시해 그 칸을 아예 렌더링하지 않는다(같은 위치의 앞 행 rowSpan이 대신
  // 채운다 — 표준 HTML 테이블 rowSpan 동작). 아직 저장 전(insert)인 행이나, 지금 "그 병합 컬럼 자체"를
  // 편집 중인 행만 병합에서 빼고 그 지점에서 구간을 끊는다 — 같은 행의 다른 컬럼을 편집 중인 것만으로는
  // 깨지지 않는다(예: 컬럼명만 고치는데 옆의 "구분" 병합이 풀려버리는 문제를 막기 위함).
  const mergeSpans = useMemo(() => {
    const spans = new Map<string, number>();
    const covered = new Set<string>();
    if (mergeColumns && mergeColumns.length > 0) {
      for (const field of mergeColumns) {
        const isFieldEditing = (row: GridRow<T>) => editing?.key === row.__key && editing.field === field;
        let anchorIdx = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowEligible = row.__status !== 'insert' && !isFieldEditing(row);
          const anchor = anchorIdx !== -1 ? rows[anchorIdx] : null;
          const anchorEligible = !!anchor && anchor.__status !== 'insert' && !isFieldEditing(anchor);
          const sameAsAnchor = anchor && anchorEligible && rowEligible && String(row[field] ?? '') === String(anchor[field] ?? '');
          if (sameAsAnchor) {
            covered.add(`${field}:${row.__key}`);
            const anchorKey = `${field}:${anchor!.__key}`;
            spans.set(anchorKey, (spans.get(anchorKey) ?? 1) + 1);
          } else {
            anchorIdx = i;
            spans.set(`${field}:${row.__key}`, 1);
          }
        }
      }
    }
    return { spans, covered };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mergeColumns, editing]);

  // 행에 포커스가 있고(셀 편집 중이 아니고) 다른 입력창에 타이핑 중도 아닐 때: 방향키로 행 이동,
  // Insert로 추가 요청, Delete로 포커스된 행 삭제 요청.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isActive || !isTabActive) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (!focusedKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const idx = rows.findIndex((r) => r.__key === focusedKey);
        if (idx === -1) return;
        const nextRow = rows[e.key === 'ArrowDown' ? idx + 1 : idx - 1];
        if (nextRow) {
          e.preventDefault();
          onFocusedRowChanged?.(nextRow.__key);
          // 방향키로 옮긴 행이 화면 밖으로 나가면 딱 보일 만큼만 따라간다(클릭 선택은 튀지 않아야 하지만,
          // 방향키는 지금 어디 있는지 계속 보여야 하므로 'center'가 아니라 'nearest'로 최소한만 스크롤).
          rowElsRef.current.get(nextRow.__key)?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Insert') {
        e.preventDefault();
        onRequestInsertRow?.();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        onRequestDeleteRow?.();
      } else if (e.key === 'Escape') {
        if (editingRowKey) {
          // 체크형 칸은 별도 입력창이 없어 Esc가 이 텍스트 input onKeyDown으로는 안 걸린다 —
          // 여기서 전역으로 받아서 편집 중이던 행 전체를 세션 시작 시점으로 되돌린다.
          e.preventDefault();
          abandonEditingRow();
        } else if (searchFormRef?.current) {
          // 편집 중이 아니라 행만 선택돼 있을 때 Esc를 누르면 그 행 포커스는 풀고 조회조건 영역
          // 첫 입력 칸으로 나간다 — 포커스만 옮기고 행 선택 표시가 그대로 남아있으면 어정쩡하다.
          e.preventDefault();
          onFocusedRowChanged?.(null);
          searchFormRef.current.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, focusedKey, isActive, isTabActive, onFocusedRowChanged, onRequestInsertRow, onRequestDeleteRow, editingRowKey, searchFormRef]);

  // 체크형(사용유무)도 텍스트 칸과 동일하게 Tab/Enter 이동 순서에 포함된다 — 방향키로 값을 뒤집고
  // Tab/Enter로 옆 칸으로 넘어갈 수 있어야 한다(마우스 클릭 토글과는 별개 경로). 드래그로 바꾼
  // 화면상 순서(visibleColumns) 그대로 이동하고, 숨긴 컬럼은 화면에 없으니 당연히 건너뛴다.
  const editableCols = visibleColumns.filter((c) => !!c.cellType);

  // 편집 중이던 행과 다른 행으로 넘어갈 때 호출한다. 추가(insert) 중이던 행이면 통째로 없애고,
  // 기존 행이면 세션 시작 시점 스냅샷으로 되돌린다 — 그 행에서 하던 편집은 전부 취소된다.
  function abandonEditingRow() {
    if (!editingRowKey) return;
    const row = rows.find((r) => r.__key === editingRowKey);
    if (row?.__status === 'insert') {
      onCancelNewRow?.(editingRowKey);
    } else if (rowSnapshot) {
      onRevertRow?.(editingRowKey, rowSnapshot);
    }
    setEditing(null);
    setFieldSnapshot(null);
    setEditingRowKey(null);
    setRowSnapshot(null);
  }

  function startEdit(row: GridRow<T>, col: GridColumn<T>) {
    if (!isCellEditable(col, row)) return;
    if (editingRowKey && editingRowKey !== row.__key) {
      // 다른 행을 편집하다가 이 행으로 넘어오는 것 — 그 행은 세션 시작 시점으로 되돌리고 시작한다.
      abandonEditingRow();
    }
    const alreadyEditingThisCell = editing?.key === row.__key && editing.field === col.dataField;
    if (editing && !alreadyEditingThisCell) {
      // 같은 행 안에서 다른 칸으로 편집을 옮길 때, blur 이벤트 타이밍에 의존하지 않고
      // 이전 칸 값을 먼저 확실히 커밋한다. 체크형은 editValue를 아예 안 쓰고(방향키를 누르는 즉시
      // onCellChange로 직접 커밋) 편집 시작 시점의 값이 editValue에 그대로 멈춰있으므로, 여기서
      // 다시 써넣으면 방향키로 바꾼 값을 그 멈춰있던 값으로 되돌려버린다 — 체크형이면 건너뛴다.
      const prevCol = columns.find((c) => c.dataField === editing.field);
      if (prevCol?.cellType !== 'check') {
        const prevRow = rows.find((r) => r.__key === editing.key);
        if (prevRow) onCellChange(prevRow.__key, editing.field as keyof T, editValue);
      }
    }
    if (editingRowKey !== row.__key) {
      // 이 행의 새 편집 세션 시작 — 취소 시 되돌릴 스냅샷을 지금 시점으로 남겨둔다.
      setEditingRowKey(row.__key);
      setRowSnapshot(row);
    }
    // 이미 이 칸을 편집 중이면(예: 같은 칸을 다시 더블클릭) 스냅샷을 다시 찍지 않는다 — 지금 값은
    // 이미 라이브 커밋된 "편집 중" 값이라, 다시 찍으면 Esc를 눌러도 그 편집 시작 시점으로 못 돌아간다.
    if (!alreadyEditingThisCell) {
      setFieldSnapshot({ key: row.__key, field: col.dataField, value: row[col.dataField] });
    }
    setEditing({ key: row.__key, field: col.dataField });
    setEditValue(String(row[col.dataField] ?? ''));
  }

  useImperativeHandle(ref, () => ({
    focusFirstEditable: (key: string) => {
      if (editingRowKey && editingRowKey !== key) abandonEditingRow();
      const row = rows.find((r) => r.__key === key);
      if (!row) return;
      const firstEditable = visibleColumns.find((c) => c.cellType !== 'check' && isCellEditable(c, row));
      if (firstEditable) requestAnimationFrame(() => startEdit(row, firstEditable));
    },
    startEditField: (key: string, field: string) => {
      if (editingRowKey && editingRowKey !== key) abandonEditingRow();
      // 행 조회 자체도 프레임 실행 시점으로 미룬다 — 호출 직전에 updateCell로 값을 바꿨다면
      // 그 갱신이 아직 이 rows 클로저에 반영 안 됐을 수 있어서, 실행 시점의 최신 rowsRef를 봐야 한다.
      requestAnimationFrame(() => {
        const row = rowsRef.current.find((r) => r.__key === key);
        const col = columns.find((c) => c.dataField === field);
        if (!row || !col) return;
        startEdit(row, col);
      });
    },
    closeEditing: () => {
      setEditing(null);
      setEditingRowKey(null);
      setRowSnapshot(null);
      setFieldSnapshot(null);
    },
    scrollToFocused: () => {
      // 저장/추가 직후 rows가 새로고침되면서 그 행의 tr이 다시 마운트될 시간이 필요하므로 한 프레임 미룬다.
      requestAnimationFrame(() => {
        const key = focusedKeyRef.current;
        if (!key) return;
        rowElsRef.current.get(key)?.scrollIntoView({ block: 'center' });
      });
    },
    rememberLayout,
    resetLayout,
    rememberMasterLayout,
    resetMasterLayout,
    isMaster,
  }));

  // Tab/Enter는 오직 "같은 행 안에서" 옆 칸으로만 이동한다. 마지막/첫 칸에서 더 이동할 칸이 없으면
  // 다른 행으로 넘어가지 않고 그냥 멈춘다 — Tab만으로 슬쩍 다음 행 편집이 시작되는 걸 막기 위함
  // (다른 행으로 넘어가려면 명시적으로 그 행을 클릭해야 하고, 그러면 이 행 편집은 취소된다).
  // 마지막 칸은 Enter가 저장을 트리거하는 것으로 대신한다.
  function moveFocus(row: GridRow<T>, col: GridColumn<T>, moveTo: 'next' | 'prev' | null) {
    setEditing(null);
    if (!moveTo) return;
    const colIdx = editableCols.findIndex((c) => c.dataField === col.dataField);
    if (colIdx === -1) return;

    if (moveTo === 'next') {
      const nextCol = editableCols[colIdx + 1];
      if (nextCol) startEdit(row, nextCol);
      return;
    }

    if (moveTo === 'prev') {
      const prevCol = editableCols[colIdx - 1];
      if (prevCol) startEdit(row, prevCol);
    }
  }

  function commitAndMove(row: GridRow<T>, col: GridColumn<T>, value: unknown, moveTo: 'next' | 'prev' | null) {
    onCellChange(row.__key, col.dataField, value);
    moveFocus(row, col, moveTo);
  }

  function handleEscape(row: GridRow<T>, col: GridColumn<T>) {
    if (row.__status === 'insert') {
      // 추가 중이던 행은 편집을 취소하면 행 자체가 사라진다 (미완성 추가를 버리는 것과 같음).
      setEditing(null);
      setFieldSnapshot(null);
      setEditingRowKey(null);
      setRowSnapshot(null);
      onCancelNewRow?.(row.__key);
      return;
    }
    // 기존 행은 지금 편집 중인 이 칸만 편집 시작 시점 값으로 되돌린다. 이미 커밋해둔 다른 칸의
    // 변경(예: 앞서 수정한 메뉴명)은 그대로 유지된다.
    // 칸 편집이 어차피 끝나는 거라 행 세션(editingRowKey)도 여기서 같이 끝낸다 — 예전엔 남겨뒀었는데,
    // 그러면 Esc를 한 번 더 눌러야 행 세션이 끝나고 그 다음에야 포커스가 빠져서 총 3번을 눌러야
    // 하는 문제가 있었다(칸 취소 → 행 세션 종료 → 포커스 해제). 행 세션만 끝낼 뿐 이미 커밋된 다른
    // 칸의 값은 안 건드리므로, 같은 행의 다른 칸은 더블클릭하면 여전히 이어서 편집할 수 있다 —
    // 다만 그 시점부터는 새 스냅샷을 다시 찍으므로 "행 전체를 원래 상태로" 되돌리는 대상이 지금
    // 이후의 값 기준으로 바뀐다.
    if (fieldSnapshot && fieldSnapshot.key === row.__key && fieldSnapshot.field === col.dataField) {
      onCellChange(row.__key, col.dataField, fieldSnapshot.value);
    }
    setEditing(null);
    setFieldSnapshot(null);
    setEditingRowKey(null);
    setRowSnapshot(null);
  }

  // Enter도 Tab처럼 옆 칸으로 넘어간다. 한 행의 마지막 칸에서 Enter를 누르면 저장을 요청한다.
  // (예전엔 기존 행 수정 중엔 Enter가 "아래 행 같은 칸"으로 이동했는데, 보통 한 행씩 순서대로
  // 칸을 채우는 흐름이라 그 동작이 오히려 다음 칸 입력을 놓치는 것처럼 느껴져서 통일했다.)
  function handleEnterKey(row: GridRow<T>, col: GridColumn<T>) {
    const colIdx = editableCols.findIndex((c) => c.dataField === col.dataField);
    const nextCol = editableCols[colIdx + 1];
    if (nextCol) {
      commitAndMove(row, col, editValue, 'next');
    } else {
      onCellChange(row.__key, col.dataField, editValue);
      setEditing(null);
      // onCellChange의 상태 반영(리렌더)이 끝난 뒤에 저장을 요청해야 방금 입력한 마지막 값이 누락되지 않는다.
      requestAnimationFrame(() => onRequestSave?.());
    }
  }

  // 체크형 칸 전용 Enter — 값은 방향키로 이미 직접 커밋돼 있어(editValue를 쓰지 않음) 텍스트 칸의
  // handleEnterKey처럼 editValue를 다시 써넣으면 안 된다. 이동/저장요청 로직만 그대로 따른다.
  function handleCheckEnterKey(row: GridRow<T>, col: GridColumn<T>) {
    const colIdx = editableCols.findIndex((c) => c.dataField === col.dataField);
    const nextCol = editableCols[colIdx + 1];
    if (nextCol) {
      moveFocus(row, col, 'next');
    } else {
      setEditing(null);
      requestAnimationFrame(() => onRequestSave?.());
    }
  }

  // F2 — 바로 위 행의 같은 칸 값을 그대로 가져온다.
  function handleF2Key(row: GridRow<T>, col: GridColumn<T>) {
    const rowIdx = rows.findIndex((r) => r.__key === row.__key);
    if (rowIdx <= 0) return;
    const aboveValue = rows[rowIdx - 1][col.dataField];
    setEditValue(String(aboveValue ?? ''));
    onCellChange(row.__key, col.dataField, aboveValue);
  }

  // 체크형 편집 테두리(ring-primary)와 톤을 맞춘다 — 옅은 ring-ring은 셀 배경/뱃지 색과 거의 겹쳐
  // 안 보이는 경우가 있어서, 어떤 배경 위에서도 대비가 되는 진한 톤을 모든 편집기에 통일해서 쓴다.
  const editorClass = 'w-full h-full min-w-0 bg-transparent text-xs outline-none ring-2 ring-inset ring-primary rounded-sm px-2';

  function renderCell(row: GridRow<T>, col: GridColumn<T>) {
    const value = row[col.dataField];
    const isEditing = editing?.key === row.__key && editing.field === col.dataField;

    if (isEditing && col.cellType === 'select') {
      return (
        <select
          autoFocus
          value={editValue}
          onChange={(e) => {
            const next = e.target.value;
            setEditValue(next);
            // 값이 바뀌는 즉시 반영 — Tab/Enter로 넘어가기 전에도 저장 버튼이 바로 활성화되게 한다.
            onCellChange(row.__key, col.dataField, next);
          }}
          onBlur={() => commitAndMove(row, col, editValue, null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEnterKey(row, col);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              commitAndMove(row, col, editValue, e.shiftKey ? 'prev' : 'next');
            } else if (e.key === 'Escape') {
              handleEscape(row, col);
            } else if (e.key === 'F2') {
              e.preventDefault();
              handleF2Key(row, col);
            }
          }}
          className={editorClass}
        >
          <option value="">(없음)</option>
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    if (isEditing && col.cellType === 'check') {
      // 체크형은 텍스트 커서 개념이 없어 편집 세션 중엔 입력창 대신 포커스 가능한 래퍼만 두고,
      // 방향키를 그대로 값 토글에 쓴다(값은 onCellChange로 즉시 커밋 — 텍스트 칸의 editValue와 달리
      // 별도 임시값 없이 바로 반영된다).
      const onValue = col.checkValues?.on ?? 'Y';
      const offValue = col.checkValues?.off ?? 'N';
      const checked = value === onValue;
      const toggle = () => onCellChange(row.__key, col.dataField, checked ? offValue : onValue);
      // 편집 모드 표시는 셀 전체가 아니라 뱃지/체크박스 자체를 감싸는 테두리로 준다 — 셀 전체 테두리는
      // 뱃지와 떨어져 있어서 "지금 이 뱃지가 편집 대상"이라는 게 잘 안 느껴진다는 피드백으로 바꿈.
      // ring-inset을 써야 한다 — 바깥쪽으로 그려지는(outset) 기본 ring은 이 뱃지의 조상 div가
      // table-layout 확정 후 truncate(overflow:hidden)로 잘려서 실제로는 안 보였다(실제 재현 확인).
      // 색은 옅은 회색으로 — 뱃지 배경색(초록/회색)과 겹쳐도 항상 대비돼 보이도록 primary(파란색) 대신 사용.
      const display =
        col.checkDisplay === 'checkbox' ? (
          <input
            type="checkbox"
            readOnly
            tabIndex={-1}
            checked={checked}
            className="w-3.5 h-3.5 rounded accent-primary pointer-events-none ring-2 ring-inset ring-gray-400"
          />
        ) : (
          <span
            className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium select-none ring-2 ring-inset ring-gray-400 ${
              checked ? col.checkColorClass ?? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {checked ? (col.checkLabels?.on ?? '사용함') : (col.checkLabels?.off ?? '미사용')}
          </span>
        );
      return (
        <div
          // div는 React autoFocus가 안 먹는다(input/select/textarea/button 전용) — ref로 직접 focus()를
          // 불러야 실제 DOM 포커스가 잡히고, 그래야 방향키가 이 onKeyDown으로 들어와 전역 행이동
          // 리스너로 새지 않는다. 시각적으로는 이미 td 자체가 포커스 행 테두리를 보여주므로, 여기
          // 자체에는 별도 ring을 안 그려 겹쳐 보이는 걸 피한다(평소 뱃지/체크박스 모양 그대로 유지).
          ref={(el) => el?.focus()}
          tabIndex={0}
          role="switch"
          aria-checked={checked}
          className="w-full h-full flex items-center outline-none cursor-pointer"
          onBlur={() => setEditing(null)}
          onClick={(e) => {
            // 편집 모드에 이미 들어와 있는 상태에서는 방향키뿐 아니라 마우스 클릭으로도 바로 토글된다.
            e.stopPropagation();
            toggle();
          }}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              // INPUT/SELECT처럼 태그명으로 자동 제외되는 요소가 아니라서, stopPropagation을 안 하면
              // 전역 방향키 리스너가 같은 이벤트로 행 포커스까지 옮겨버린다.
              e.preventDefault();
              e.stopPropagation();
              toggle();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              handleCheckEnterKey(row, col);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              moveFocus(row, col, e.shiftKey ? 'prev' : 'next');
            } else if (e.key === 'Escape') {
              handleEscape(row, col);
            } else if (e.key === 'F2') {
              e.preventDefault();
              handleF2Key(row, col);
            }
          }}
        >
          {display}
        </div>
      );
    }

    if (isEditing && (col.cellType === 'date' || col.cellType === 'time')) {
      // date: 저장값 YYYYMMDD <-> HTML input YYYY-MM-DD 변환. time: HH:MM 그대로.
      const inputValue = col.cellType === 'date'
        ? editValue.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
        : editValue;
      return (
        <input
          autoFocus
          type={col.cellType}
          value={inputValue}
          onChange={(e) => {
            const raw = e.target.value;
            const stored = col.cellType === 'date' ? raw.replace(/-/g, '') : raw;
            setEditValue(stored);
            onCellChange(row.__key, col.dataField, stored);
          }}
          onBlur={() => commitAndMove(row, col, editValue, null)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') { e.preventDefault(); commitAndMove(row, col, editValue, e.shiftKey ? 'prev' : 'next'); }
            else if (e.key === 'Escape') handleEscape(row, col);
            else if (e.key === 'Enter') { e.preventDefault(); handleEnterKey(row, col); }
          }}
          className={editorClass}
        />
      );
    }

    if (isEditing) {
      const input = (
        <input
          autoFocus
          type={col.cellType === 'password' ? 'password' : 'text'}
          placeholder={col.placeholder}
          value={editValue}
          onChange={(e) => {
            const raw = e.target.value;
            if (col.maxLength && byteLength(raw) > col.maxLength) return; // 바이트 기준 초과 시 입력 무시
            const next = col.transform ? col.transform(raw) : raw;
            setEditValue(next);
            // 값이 바뀌는 즉시 반영 — Tab/Enter로 넘어가기 전에도 저장 버튼이 바로 활성화되게 한다.
            onCellChange(row.__key, col.dataField, next);
          }}
          onFocus={(e) => e.target.select()}
          onBlur={() => commitAndMove(row, col, editValue, null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEnterKey(row, col);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              commitAndMove(row, col, editValue, e.shiftKey ? 'prev' : 'next');
            } else if (e.key === 'Escape') {
              handleEscape(row, col);
            } else if (e.key === 'F2') {
              e.preventDefault();
              handleF2Key(row, col);
            } else if (e.key === ' ' && col.cellType === 'help') {
              // 레거시 4GL 관례 — 스페이스바를 누르면 헬프 피커가 뜬다(HelpInput과 동일한 동작).
              e.preventDefault();
              onOpenHelpPicker?.(row, col);
            }
          }}
          className={col.cellType === 'help' ? `${editorClass} pr-7` : editorClass}
        />
      );
      if (col.cellType !== 'help') return input;
      return (
        <div className="relative w-full h-full">
          {input}
          <button
            type="button"
            tabIndex={-1}
            // 버튼 클릭으로 인풋이 blur되면 그 순간 onBlur의 commitAndMove가 편집을 닫아버리므로,
            // mousedown 단계에서 막아 편집 세션이 열린 채로 피커를 띄운다.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onOpenHelpPicker?.(row, col)}
            title="찾아보기"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    // 읽기 모드 표시 — render가 있으면 항상 우선한다 (cellType은 편집 방식만 결정).
    if (col.render) return col.render(value as T[keyof T], row);
    if (col.cellType === 'date') {
      const s = String(value ?? '');
      const d = s.replace(/-/g, '');
      return <span>{d.length === 8 ? `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}` : s}</span>;
    }
    // 체크형(사용유무)은 별도 편집모드 없이 클릭하는 즉시 값이 뒤집힌다 (td onClick에서 처리).
    if (col.cellType === 'check') {
      const onValue = col.checkValues?.on ?? 'Y';
      const checked = value === onValue;
      if (col.checkDisplay === 'checkbox') {
        // 실제 토글은 td의 onClick이 처리하므로, 이 체크박스는 순수 표시용이다(pointer-events-none).
        return (
          <input
            type="checkbox"
            readOnly
            checked={checked}
            disabled={!isCellEditable(col, row)}
            className="w-3.5 h-3.5 rounded accent-primary pointer-events-none disabled:opacity-50"
          />
        );
      }
      const onLabel = col.checkLabels?.on ?? '사용함';
      const offLabel = col.checkLabels?.off ?? '미사용';
      return (
        <span
          className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium select-none ${
            checked ? col.checkColorClass ?? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {checked ? onLabel : offLabel}
        </span>
      );
    }
    if (col.cellType === 'select' && col.options) {
      const opt = col.options.find((o) => o.value === value);
      return <span className="whitespace-nowrap">{opt?.label ?? String(value ?? '')}</span>;
    }
    if (col.cellType === 'password') {
      if (value) {
        return (
          <input
            type="password"
            readOnly
            tabIndex={-1}
            value={String(value)}
            className="w-24 bg-transparent border-none text-muted-foreground pointer-events-none focus:outline-none"
          />
        );
      }
      // 기존 행은 API가 비밀번호를 반환하지 않으므로 마스킹 플레이스홀더를 표시한다.
      if (row.__status !== 'insert') {
        return <span className="text-muted-foreground tracking-widest select-none">••••••••</span>;
      }
      return <span />;
    }
    return <span className="whitespace-nowrap">{value === null || value === undefined ? '' : String(value)}</span>;
  }

  const hiddenColumnList = orderedColumns.filter((c) => hiddenColumns.has(c.dataField));

  return (
    <div className="border border-border rounded overflow-auto flex-1 min-h-0" onContextMenu={handleGridContextMenu}>
      {/* border-collapse는 position:sticky와 같이 쓰면 브라우저마다(특히 Safari) 셀별로
          들쭉날쭉 깨지는 게 알려진 제약이라, border-separate + spacing 0으로 대신한다
          (겉보기 선 모양은 동일하게 유지된다). */}
      {/* DndContext는 접근성 안내용 숨김 div를 실제로 렌더링하므로(children을 감싸는 게 아니라
          형제로 그려짐), tr 안에 두면 "table 자식으로 div가 올 수 없다"는 하이드레이션 에러가
          난다 — table 전체를 감싸서 그 div가 table의 형제로 나오게 한다. SortableContext는 순수
          컨텍스트라(자체 DOM 없음) tr 안에 그대로 둬도 된다. */}
      <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd} modifiers={[restrictToHorizontalAxis]}>
        <table
          className={`text-xs border-separate ${layoutFixed ? '' : 'w-full'}`}
          style={{
            borderSpacing: 0,
            tableLayout: layoutFixed ? 'fixed' : 'auto',
            // layoutFixed 상태에서 width:100%를 그대로 두면, table-layout:fixed 알고리즘이 각 셀의
            // width/maxWidth를 절대값이 아니라 "100%를 채우기 위한 비율"로만 취급해서 컬럼폭 합이
            // 컨테이너보다 좁아도 다시 늘려 채워버린다. 100% 강제를 빼고 컬럼폭 합 그대로(auto) 두면
            // 합이 좁을 땐 그만큼 진짜로 좁게(오른쪽에 빈 공간), 넘칠 땐 그만큼 가로 스크롤이 생긴다.
            ...(layoutFixed ? { width: 'auto' } : undefined),
          }}
        >
          <thead>
            {/*
              border-b/divide-y를 tr(또는 tbody)에 직접 주면 안 보인다 — border-separate 테이블에서는
              행(tr) 단위 테두리가 렌더링되지 않고 셀(th/td) 단위 테두리만 그려진다. 그래서 아래
              헤더/본문 구분선과 행 구분선은 전부 각 th/td에 개별적으로 border-b를 준다.
            */}
            <tr ref={headerRowRef} className="bg-muted divide-x divide-border">
              {selection && (
                <th className="w-8 px-3 py-2.5 sticky top-0 left-0 bg-muted z-20 border-b border-border">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                    checked={selection.allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !selection.allSelected && selection.someSelected;
                    }}
                    onChange={selection.onToggleAll}
                  />
                </th>
              )}
              <SortableContext items={visibleColumns.map((c) => c.dataField)} strategy={horizontalListSortingStrategy}>
                {visibleColumns.map((col, colIndex) => {
                  const isEditableCol = !!col.cellType;
                  const stickyLeft = stickyLefts[col.dataField];
                  const width = widths[col.dataField];
                  // 고정 영역의 마지막 컬럼 자신에게 오른쪽 구분선을 붙인다 — 다음(스크롤되는) 컬럼의
                  // 왼쪽 테두리에 의존하면 가로 스크롤 시 그 테두리도 같이 흘러가버려 고정 컬럼 쪽엔
                  // 구분선이 하나도 안 남는다.
                  const isLastSticky = colIndex === stickyUntilIndex;
                  // 진짜 마지막 컬럼도 같은 이유로 자기 오른쪽에 구분선을 붙인다 — 컬럼폭 합이 컨테이너보다
                  // 좁아 오른쪽에 빈 공간이 생기더라도(의도된 동작, 아래 maxWidth 참고), 실제 컬럼이 끝나는
                  // 지점이 어디인지 표시해준다.
                  const isVeryLastCol = colIndex === visibleColumns.length - 1;
                  return (
                    <SortableColumnHeader
                      key={col.dataField}
                      col={col}
                      displayCaption={columnLabels[col.dataField] ?? col.caption}
                      stickyLeft={stickyLeft}
                      width={width}
                      layoutFixed={layoutFixed}
                      isEditableCol={isEditableCol}
                      isLastSticky={isLastSticky}
                      isVeryLastCol={isVeryLastCol}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        // 컬럼 우클릭 메뉴는 그 컬럼 전용(스티키/정렬/숨기기 등)이라, 빈 공간용 전역
                        // 우클릭 핸들러(그리드 컨테이너)로 새지 않게 막는다.
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, colIndex, dataField: col.dataField });
                      }}
                      onResizeStart={startResize}
                    />
                  );
                })}
              </SortableContext>
            </tr>
          </thead>
          <tbody>
          {loading && (
            <tr>
              <td colSpan={visibleColumns.length + (selection ? 1 : 0)} className="text-center py-10 text-muted-foreground">
                불러오는 중...
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={visibleColumns.length + (selection ? 1 : 0)} className="text-center py-10 text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row, idx) => {
              const isFocused = focusedKey === row.__key;
              const zebra = idx % 2 === 1;
              return (
                <tr
                  key={row.__key}
                  ref={(el) => {
                    // scrollToFocused()가 나중에 이 행을 찾아 스크롤할 수 있도록 엘리먼트만 담아둔다
                    // (여기서 바로 스크롤하면 단순 클릭 선택만으로도 매번 화면이 튀게 된다).
                    if (el) rowElsRef.current.set(row.__key, el);
                    else rowElsRef.current.delete(row.__key);
                  }}
                  onClick={() => onFocusedRowChanged?.(row.__key)}
                  // scroll-mt: 방향키로 위로 이동할 때 scrollIntoView({block:'nearest'})가 이 행을
                  // "보인다"고 판단해도 실제로는 sticky thead 밑에 가려질 수 있어서, 헤더 높이만큼
                  // 스크롤 여유(margin)를 줘서 항상 헤더 아래로 노출되게 한다.
                  // transition-colors는 뺐다 — sticky 헤더/체크박스 재배치와 겹치면서 배경색이 전환
                  // 애니메이션 되는 동안 스크롤된 다른 행의 텍스트와 겹쳐 보이는 원인이었다.
                  className="cursor-pointer divide-x divide-border scroll-mt-10"
                >
                  {selection && (
                    <td
                      className={`px-3 py-2 sticky left-0 z-10 border-b border-border ${cellBgClass(row.__status, isFocused, zebra, false, focusRowColorClass, getRowAccentClass?.(row))}`}
                      style={{ willChange: 'transform' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        selection.onToggleRow(row.__key);
                      }}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                        checked={selection.selectedKeys.has(row.__key)}
                      />
                    </td>
                  )}
                  {visibleColumns.map((col, colIndex) => {
                    const isMergeCol = !!mergeColumns?.includes(col.dataField);
                    if (isMergeCol && mergeSpans.covered.has(`${col.dataField}:${row.__key}`)) {
                      // 위 행의 rowSpan이 이 자리를 대신 채운다 — 이 칸은 그리지 않는다.
                      return null;
                    }
                    const mergeRowSpan = isMergeCol ? mergeSpans.spans.get(`${col.dataField}:${row.__key}`) : undefined;
                    const editable = isCellEditable(col, row);
                    const isEditing = editing?.key === row.__key && editing.field === col.dataField;
                    const stickyLeft = stickyLefts[col.dataField];
                    const width = widths[col.dataField];
                    const isLastSticky = colIndex === stickyUntilIndex;
                    const isVeryLastCol = colIndex === visibleColumns.length - 1;
                    return (
                      <td
                        key={col.dataField}
                        rowSpan={mergeRowSpan && mergeRowSpan > 1 ? mergeRowSpan : undefined}
                        style={{
                          // rowSpan으로 여러 행에 걸치는 병합 칸은 세로 가운데로 보이게 한다(그 안의
                          // 내용 div는 고정 높이(h-9)라 td 자체의 vertical-align이 있어야 중앙에 온다).
                          ...(mergeRowSpan && mergeRowSpan > 1 ? { verticalAlign: 'middle' } : undefined),
                          ...(stickyLeft !== undefined ? { left: stickyLeft, willChange: 'transform' } : undefined),
                          // th와 동일한 폭을 td에도 명시적으로 줘야, table-layout:fixed에서 헤더 폭과
                          // 본문 폭이 어긋나 입력칸이 옆 컬럼을 침범하거나 컬럼 안이 비어 보이는 문제가 없다.
                          // maxWidth도 th와 동일하게 줘서 컬럼폭 합이 컨테이너보다 좁아도 다른 컬럼이
                          // 늘어나 채우지 않게 한다(오른쪽에 빈 공간이 남는 게 의도된 동작).
                          ...(layoutFixed && width ? { width, minWidth: width, maxWidth: width } : undefined),
                          // th와 동일하게 box-shadow로 구분선을 그린다 (divide-x가 border-right를 덮어써서
                          // border 유틸로는 안 된다). 다른 구분선과 같은 굵기·색으로 맞춘다.
                          ...(isLastSticky || isVeryLastCol ? { boxShadow: '1px 0 0 0 hsl(var(--border))' } : undefined),
                        }}
                        onClick={(e) => {
                          // 다른 행을 편집하던 중이면, 이 행을 클릭하는 순간 그 행 편집은 취소(스냅샷으로 복원)된다.
                          if (editingRowKey && editingRowKey !== row.__key) abandonEditingRow();
                          // 편집 가능한 칸을 클릭하면 아래에서 stopPropagation하기 때문에,
                          // tr의 onClick(행 선택)이 버블링으로 실행되지 않는다 — 여기서 직접 호출.
                          onFocusedRowChanged?.(row.__key);
                          if (!editable) return;
                          e.stopPropagation();
                          // 단일 클릭으로는 어떤 칸도 편집이 열리지 않는다 — 한 번에 한 칸만 편집하도록,
                          // 편집은 더블클릭/수정 버튼으로 열고 그 다음엔 Tab/Enter로만 옆 칸으로 이동한다.
                          // 체크형도 이제 다른 칸과 동일하게 클릭만으로는 안 바뀌고, 더블클릭/Tab-Enter로
                          // 진입한 편집 모드 안에서 방향키로만 값이 바뀐다(값이 바로 뒤집히던 예전 동작 제거).
                        }}
                        onDoubleClick={(e) => {
                          if (!editable) return;
                          e.stopPropagation();
                          // 다른 행을 편집하던 중이었다면 startEdit 내부에서 그 행을 스냅샷으로 되돌리고 시작한다.
                          startEdit(row, col);
                        }}
                        className={`p-0 border-b border-border ${
                          editable ? (col.cellType === 'check' ? 'cursor-pointer' : 'cursor-text') : 'text-muted-foreground'
                        } ${
                          stickyLeft !== undefined ? 'sticky z-10' : ''
                        } ${
                          // 병합(rowSpan) 칸은 여러 행에 걸쳐 있는 "구분 라벨"이라, 그 중 한 행이 포커스/편집
                          // 상태여도 칸 전체가 파랗게 칠해지면(실제로는 한 행만 대상인데 4행 전체가 강조돼
                          // 보임) 어색하다 — 병합 칸에는 포커스/신규/수정 강조를 적용하지 않고 항상 중립 배경만 쓴다.
                          isMergeCol
                            ? cellBgClass('unchanged', false, zebra, false, focusRowColorClass, getRowAccentClass?.(row))
                            : cellBgClass(
                                row.__status,
                                isFocused,
                                zebra,
                                editable,
                                focusRowColorClass,
                                getRowAccentClass?.(row)
                              )
                        } ${
                          // ring(box-shadow)은 border-width와 달리 레이아웃 박스 크기에 영향을 안 줘서, 포커스된
                          // 행이 하필 그 컬럼에서 가장 긴 값을 가진 행일 때 컬럼 자동폭이 미세하게 늘어나던
                          // 문제(border-width 2px 증가가 원인이었음)가 없다.
                          isFocused && !isMergeCol ? `ring-2 ring-inset ${focusBorderColorClass}` : ''
                        }`}
                      >
                        <div
                          // font-semibold(볼드체)는 안 쓴다 — 같은 글자라도 폭이 넓어져서, table-layout:auto인
                          // 컬럼들이 포커스 행이 바뀔 때마다 폭을 다시 계산해 미세하게 흔들리는 원인이었다.
                          // 포커스 표시는 배경색/테두리(cellBgClass, focusBorderColorClass)로 충분하다.
                          // layoutFixed가 되면 모든 컬럼이 실제 픽셀 폭으로 고정되므로, fixedWidth 지정이
                          // 없는 컬럼도(예: 비고, 설명) 긴 값이 옆 컬럼을 침범하지 않도록 잘라야 한다 —
                          // 그 전(table-layout:auto, 아직 폭 측정 전)에는 whitespace-nowrap으로 두어
                          // 컬럼이 내용에 맞춰 자연스럽게 넓어지게 둔다.
                          className={`${CELL_HEIGHT} flex items-center min-w-0 ${
                            layoutFixed || col.fixedWidth
                              ? `truncate ${!layoutFixed ? col.widthClass ?? 'max-w-xs' : ''}`
                              : 'whitespace-nowrap'
                          } ${alignClass(columnAlignOverride[col.dataField] ?? col.align)} ${
                            isEditing && col.cellType !== 'check'
                              ? ''
                              : `px-3 ${editable && col.cellType !== 'check' ? 'hover:ring-2 hover:ring-inset hover:ring-ring/40' : ''}`
                          } ${getRowTextClass?.(row) ?? ''}`}
                          title={
                            (layoutFixed || col.fixedWidth) && !isEditing && typeof row[col.dataField] === 'string'
                              ? (row[col.dataField] as string)
                              : undefined
                          }
                        >
                          {renderCell(row, col)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </DndContext>
      {contextMenu && (
        <div
          // 우클릭 메뉴 — 문서 전체 기준 고정 위치라 그리드의 overflow-auto 스크롤과 무관하게 커서 옆에 뜬다.
          className="fixed z-50 bg-card border border-border rounded shadow-md py-1 text-xs min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={rememberLayout}
            className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
          >
            형태 기억
          </button>
          <button
            onClick={resetLayout}
            className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
          >
            원래 형태로
          </button>
          {isMaster && (
            <button
              onClick={rememberMasterLayout}
              className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
            >
              (마스터)형태 기억
            </button>
          )}
          {isMaster && (
            <button
              onClick={resetMasterLayout}
              className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
            >
              (마스터)원래 형태로
            </button>
          )}
          {contextMenu.dataField && isMaster && (
            <>
              <div className="my-1 border-t border-border" />
              {renamingField === contextMenu.dataField ? (
                <div className="px-3 py-1.5 flex items-center gap-1">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRenameColumn();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenamingField(null);
                      }
                    }}
                    className="w-28 px-1.5 py-0.5 text-xs border border-border rounded bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button onClick={commitRenameColumn} className="p-1 text-primary hover:bg-accent rounded shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={startRenameColumn}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                >
                  헤더 이름 바꾸기
                </button>
              )}
              {columnLabels[contextMenu.dataField] && (
                <button
                  onClick={resetColumnLabelToDefault}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                >
                  헤더 이름 원래대로
                </button>
              )}
            </>
          )}
          {contextMenu.dataField && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={setStickyUntilHere}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
              >
                여기까지 스크롤 고정
              </button>
              <button
                onClick={clearStickyColumns}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
              >
                스크롤 고정 해제
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => setColumnAlign('left')}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center justify-between"
              >
                왼쪽 정렬
                {(columnAlignOverride[contextMenu.dataField] ?? visibleColumns[contextMenu.colIndex]?.align ?? 'left') === 'left' && (
                  <Check className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setColumnAlign('center')}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center justify-between"
              >
                가운데 정렬
                {(columnAlignOverride[contextMenu.dataField] ?? visibleColumns[contextMenu.colIndex]?.align ?? 'left') === 'center' && (
                  <Check className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setColumnAlign('right')}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors flex items-center justify-between"
              >
                오른쪽 정렬
                {(columnAlignOverride[contextMenu.dataField] ?? visibleColumns[contextMenu.colIndex]?.align ?? 'left') === 'right' && (
                  <Check className="w-3.5 h-3.5" />
                )}
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={hideCurrentColumn}
                disabled={visibleColumns.length <= 1}
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                이 열 숨기기
              </button>
            </>
          )}
          {hiddenColumnList.length > 0 && (
            <>
              <div className="my-1 border-t border-border" />
              {hiddenColumnList.map((col) => (
                <button
                  key={col.dataField}
                  onClick={() => showColumn(col.dataField)}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                >
                  {col.caption} 표시
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const DataGrid = forwardRef(DataGridInner) as <T extends Record<string, unknown>>(
  props: DataGridProps<T> & { ref?: React.ForwardedRef<DataGridHandle> }
) => ReturnType<typeof DataGridInner>;
