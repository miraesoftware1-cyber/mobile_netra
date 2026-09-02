'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, getYear } from 'date-fns';
import { ko } from 'date-fns/locale';
import { AlertCircle, Loader2, RefreshCw, User, Building2, LogOut, CalendarRange } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/hooks/use-auth-store';
import { fetchApprovalList, approveLeave, ApprovalListItem, ApproveItem } from '@/features/leave/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
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

const formatDate = (dateStr: string) => {
  if (!dateStr || dateStr.length < 8) return dateStr;
  const normalized = dateStr.replace(/-/g, '');
  const date = new Date(
    Number(normalized.slice(0, 4)),
    Number(normalized.slice(4, 6)) - 1,
    Number(normalized.slice(6, 8))
  );
  return format(date, 'yyyy/MM/dd', { locale: ko });
};

const buildRowKey = (item: ApprovalListItem) =>
  `${item.emp_code}:${item.year_st}:${item.year_seq}`;

const SELECT_ALL_CHECKBOX_ID = 'leave-approval-select-all';

type ActionType = 'approve' | 'cancel';

export function LeaveApprovalList({ canApprove }: { canApprove: boolean }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const queryClient = useQueryClient();

  const managedDeptNames = user?.manage_dpt_names;
  const departmentLabel =
    managedDeptNames && managedDeptNames.trim().length > 0
      ? managedDeptNames
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .join(', ')
      : user?.dpt_name;

  const currentYear = String(getYear(new Date()));
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasManageDptCodes = !!user?.manage_dpt_codes;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'leave-approval-list',
      user?.companyCode,
      user?.corp_code,
      user?.manage_dpt_codes,
      currentYear,
    ],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      if (!user) throw new Error('로그인이 필요합니다.');
      const result = await fetchApprovalList(
        user.companyCode,
        user.corp_code,
        user.manage_dpt_codes,
        currentYear
      );
      if (!result.success) throw new Error((result as { success: false; error: string }).error);
      const ok = result as { success: true; data: ApprovalListItem[]; emptyMessage?: string };
      return { items: ok.data, emptyMessage: ok.emptyMessage };
    },
    enabled: !!user && hasManageDptCodes,
  });

  const handleRelogin = () => {
    logout();
    router.replace('/login');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('로그인이 필요합니다.');
      const approveItems: ApproveItem[] = (data?.items ?? [])
        .filter((item) => selectedKeys.has(buildRowKey(item)))
        .map((item) => ({
          emp_code: item.emp_code,
          year_st: item.year_st,
          year_seq: item.year_seq,
        }));
      const result = await approveLeave(user.companyCode, approveItems);
      if (!result.success) throw new Error((result as { success: false; error: string }).error);
      return result;
    },
    onSuccess: (result) => {
      setSelectedKeys(new Set());
      if (result.success) {
        setSuccessMessage((result as { success: true; message: string }).message);
      }
      queryClient.invalidateQueries({ queryKey: ['leave-approval-list'] });
    },
  });

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    const allKeys = data.items.map(buildRowKey);
    const allSelected = allKeys.every((k) => selectedKeys.has(k));
    setSelectedKeys(allSelected ? new Set() : new Set(allKeys));
  };

  const handleAction = (action: ActionType) => {
    if (action === 'cancel') {
      router.push('/menu');
      return;
    }
    if (selectedKeys.size === 0) return;
    setPendingAction(action);
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    mutation.mutate();
    setPendingAction(null);
  };

  if (!hasManageDptCodes) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-orange-400" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-800">세션 정보가 만료되었습니다</span>
          <span className="text-xs text-gray-400">
            부서 정보를 불러오려면 다시 로그인해주세요.
          </span>
        </div>
        <button
          onClick={handleRelogin}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold active:opacity-80 transition-opacity"
        >
          <LogOut className="w-4 h-4" />
          다시 로그인
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">승인 대기 목록을 불러오는 중...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <span className="text-sm">목록을 불러오지 못했습니다.</span>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-primary underline underline-offset-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          다시 시도
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const emptyListLabel = data?.emptyMessage ?? '승인 대기 중인 연차가 없습니다.';
  const allSelected = items.length > 0 && items.every((item) => selectedKeys.has(buildRowKey(item)));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 flex flex-col gap-3 px-4 pt-4">
        {user && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                {departmentLabel ?? ''}
              </span>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-gray-400">총 {items.length}건</span>
            {canApprove && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                <Checkbox
                  id={SELECT_ALL_CHECKBOX_ID}
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                />
                <label
                  htmlFor={SELECT_ALL_CHECKBOX_ID}
                  className="cursor-pointer select-none hover:text-gray-700"
                >
                  전체 선택
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-400">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm text-center px-4">{emptyListLabel}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const rowKey = buildRowKey(item);
              const isSelected = selectedKeys.has(rowKey);
              return (
                <div
                  key={rowKey}
                  onClick={() => canApprove && toggleKey(rowKey)}
                  className={[
                    'bg-white rounded-xl border shadow-sm px-4 py-3.5 flex gap-3 transition-colors',
                    canApprove ? 'cursor-pointer' : 'cursor-default',
                    isSelected ? 'border-primary/40 bg-primary/5' : 'border-gray-100',
                  ].join(' ')}
                >
                  {canApprove && (
                    <div
                      className="pt-0.5 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleKey(rowKey)}
                        aria-label={`${item.emp_name} 선택`}
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900">{item.emp_name}</span>
                        <span className="text-xs text-gray-400">{item.emp_code}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                        {item.holiday_typ}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <CalendarRange className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="font-medium">
                        {formatDate(item.year_bdate)} ~ {formatDate(item.year_edate)}
                      </span>
                      <span className="text-gray-400">({item.year_emday}일)</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '발생연차', value: `${item.year_alday}일` },
                        { label: '미사용연차', value: `${item.year_reday}일` },
                        { label: '사용연차', value: `${item.year_emday}일` },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-50 rounded-lg px-2.5 py-1.5 flex flex-col items-center gap-0.5">
                          <span className="text-xs text-gray-400">{label}</span>
                          <span className="text-sm font-semibold text-gray-700">{value}</span>
                        </div>
                      ))}
                    </div>

                    {item.year_reason && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                        {item.year_reason}
                      </div>
                    )}

                    <div className="text-[11px] text-gray-400">
                      신청일: {formatDate(item.year_rdate)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex gap-3 px-4 py-4 bg-white border-t border-gray-100">
        <Button
          variant="outline"
          className="flex-1 h-12 border-gray-200 text-gray-600"
          disabled={mutation.isPending}
          onClick={() => handleAction('cancel')}
        >
          취소
        </Button>
        {canApprove && (
          <Button
            className="flex-1 h-12 font-semibold gap-2"
            disabled={selectedKeys.size === 0 || mutation.isPending}
            onClick={() => handleAction('approve')}
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CalendarRange className="w-4 h-4" />
                {`승인하기${selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}`}
              </>
            )}
          </Button>
        )}
      </div>

      <AlertDialog open={pendingAction !== null} onOpenChange={() => setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === 'approve' ? '연차 승인' : '연차 취소'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedKeys.size}건의 연차를{' '}
              {pendingAction === 'approve' ? '승인' : '취소'}하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={successMessage !== null} onOpenChange={() => setSuccessMessage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>승인 완료</AlertDialogTitle>
            <AlertDialogDescription>{successMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSuccessMessage(null)}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
