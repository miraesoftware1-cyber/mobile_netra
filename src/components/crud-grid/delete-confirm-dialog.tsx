'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  label,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        // Radix 기본값은 컨텐츠 컨테이너 자체에 포커스를 줘서 열자마자 방향키/엔터가 아무 버튼도 못 건드린다 —
        // "취소"에 기본 포커스를 줘서(실수로 엔터 쳐도 안전한 쪽) 열자마자 엔터/방향키가 바로 먹게 한다.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-role="cancel"]')?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const cancelBtn = document.querySelector<HTMLButtonElement>('[data-role="cancel"]');
            const actionBtn = document.querySelector<HTMLButtonElement>('[data-role="action"]');
            const next = document.activeElement === actionBtn ? cancelBtn : actionBtn;
            next?.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            {label}
            <br />
            삭제하면 즉시 반영되며 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-role="cancel">취소</AlertDialogCancel>
          <AlertDialogAction data-role="action" onClick={onConfirm}>
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
