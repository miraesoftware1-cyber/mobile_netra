'use client';

import { Plus, Pencil, Trash2, Save, Search, ArrowUp, ArrowDown } from 'lucide-react';

type CrudGridActionsProps = {
  onQuery: () => void;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSave: boolean;
  saving: boolean;
  deleting: boolean;
  changedCount: number;
  // 순서(우선순위)가 있는 목록에서만 쓴다 — 둘 다 생략하면 위/아래 버튼 자체가 안 보인다.
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

const primaryBtn =
  'flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const outlineBtn =
  'flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const destructiveBtn =
  'flex items-center gap-1.5 px-3 py-1.5 text-xs border border-destructive text-destructive rounded hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

// useCrudGrid 화면들의 조회/추가/수정/삭제/저장 툴바 버튼 — SearchForm의 actions 슬롯에 그대로 넣는다.
export function CrudGridActions({
  onQuery,
  onAdd,
  onEdit,
  onDelete,
  onSave,
  canAdd,
  canEdit,
  canDelete,
  canSave,
  saving,
  deleting,
  changedCount,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: CrudGridActionsProps) {
  const showMove = onMoveUp || onMoveDown;
  return (
    <>
      {showMove && (
        <>
          <button onClick={onMoveUp} disabled={!canMoveUp} className={outlineBtn}>
            <ArrowUp className="w-3.5 h-3.5" /> 위
          </button>
          <button onClick={onMoveDown} disabled={!canMoveDown} className={outlineBtn}>
            <ArrowDown className="w-3.5 h-3.5" /> 아래
          </button>
        </>
      )}
      <button onClick={onQuery} className={outlineBtn}>
        <Search className="w-3.5 h-3.5" /> 조회
      </button>
      <button onClick={onAdd} disabled={!canAdd} className={primaryBtn}>
        <Plus className="w-3.5 h-3.5" /> 추가
      </button>
      <button onClick={onEdit} disabled={!canEdit} className={outlineBtn}>
        <Pencil className="w-3.5 h-3.5" /> 수정
      </button>
      <button onClick={onDelete} disabled={!canDelete || deleting} className={destructiveBtn}>
        <Trash2 className="w-3.5 h-3.5" /> {deleting ? '삭제 중...' : '삭제'}
      </button>
      <button onClick={onSave} disabled={!canSave || saving} className={primaryBtn}>
        <Save className="w-3.5 h-3.5" />
        {saving ? '저장 중...' : '저장'}
      </button>
    </>
  );
}
