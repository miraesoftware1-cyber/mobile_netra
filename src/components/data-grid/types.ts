// ERP_WEB_CLAUDE의 BaseGrid/useGridModel 패턴을 new_pdm(shadcn/Tailwind) 스타일로 옮긴 공용 그리드 모듈.
// 화면은 컬럼 설정(GridColumn[])만 선언하고, 실제 인라인 편집/행 상태 관리는 이 모듈이 담당한다.
import type { ReactNode } from 'react';

export type RowStatus = 'unchanged' | 'insert' | 'update' | 'delete';

// 그리드가 다루는 모든 행은 원본 데이터(T) + 그리드 전용 메타(키, 상태)를 함께 갖는다.
export type GridRow<T> = T & {
  __key: string;
  __status: RowStatus;
  // 서버에서 불러온 시점의 원본 값(신규 추가 행은 없음) — updateCell이 값을 바꿀 때마다 이걸 기준으로
  // "정말 원본과 달라졌는지" 다시 계산해서 __status를 매긴다. 이게 없으면 한 번이라도 값을 바꿨다가
  // 도로 원래 값으로 되돌려도 __status가 'update'로 눌어붙어 수정됨(노란색) 표시가 안 사라진다.
  __original?: T;
};

// 'help'는 텍스트 입력 + 옆에 검색용 헬프 버튼("?")이 붙는 칸이다 (DataGrid의 onOpenHelpPicker prop과 짝).
export type CellType = 'text' | 'select' | 'check' | 'password' | 'help' | 'date' | 'time';

export type SelectOption = { value: string; label: string };

export type GridColumn<T> = {
  dataField: keyof T & string;
  caption: string;
  widthClass?: string; // 예: 'w-32'
  cellType?: CellType; // 기본 'text'. 지정 안 하면 읽기 전용 표시 컬럼. 'password'는 편집 시 마스킹 입력.
  editable?: boolean; // 기본: cellType이 있으면 true
  // 신규 추가된 행(insert)에서만 수정 가능하고, 기존 행에서는 잠기는 컬럼(예: 기본키).
  lockOnUpdate?: boolean;
  required?: boolean;
  // insert(신규) 행에서만 필수 — update(수정) 시에는 빈 값 허용 (예: 비밀번호 변경 선택).
  requiredOnInsert?: boolean;
  options?: SelectOption[]; // cellType='select'일 때 선택지
  // cellType='check'일 때 어떤 값을 켬/끔으로 볼지, 뱃지에 뭐라고 표시할지 (기본 Y/N, 사용함/미사용).
  // 'Y'/'N' 같은 문자열 플래그뿐 아니라, DB 컬럼이 진짜 boolean(bit)인 화면(예: AI_* 모듈의 Postgres
  // 테이블)도 있어서 boolean도 허용한다.
  checkValues?: { on: string | boolean; off: string | boolean };
  checkLabels?: { on: string; off: string };
  checkColorClass?: string; // 켜짐 상태 뱃지 색상 (기본: 'bg-green-100 text-green-700')
  // 'badge'(기본): 사용함/미사용 알약 뱃지 하나짜리 컬럼용. 'checkbox': 권한관리처럼 체크형 컬럼이
  // 여러 개 나란히 있을 때 뱃지 대신 실제 체크박스 모양으로 표시(토글 동작 자체는 동일하게 td 클릭으로 처리).
  checkDisplay?: 'badge' | 'checkbox';
  render?: (value: T[keyof T], row: GridRow<T>) => ReactNode; // 읽기 모드 표시 커스터마이즈 (cellType 기본 표시보다 우선)
  align?: 'left' | 'center' | 'right';
  // DB 컬럼 길이에 맞춰 입력 자체를 막는다 (varchar(1) 같은 짧은 컬럼에 긴 값을 넣어
  // "String or binary data would be truncated" 저장 실패가 나는 것을 미리 방지).
  maxLength?: number;
  // 편집 입력칸의 placeholder (예: 날짜 형식 힌트 'YYYY-MM-DD').
  placeholder?: string;
  // 입력값을 즉시 가공한다 — onChange마다 호출되며 반환값이 editValue와 저장값 모두에 반영된다.
  // 예: 시간 마스킹 (raw "1230" → "12:30").
  transform?: (raw: string) => string;
  // true면 widthClass가 실제 최대 폭이 된다 — API 키처럼 아주 긴 값이 들어와도 컬럼이 늘어나지
  // 않고 말줄임표(...)로 잘린다(전체 값은 hover 시 title 툴팁으로 확인). 기본은 false(내용에
  // 맞춰 컬럼 폭이 늘어남 — 지금까지의 기본 동작).
  fixedWidth?: boolean;
};

export function isCellEditable<T>(col: GridColumn<T>, row: GridRow<T>): boolean {
  const editable = col.editable ?? !!col.cellType;
  if (!editable) return false;
  if (col.lockOnUpdate && row.__status !== 'insert') return false;
  return true;
}
