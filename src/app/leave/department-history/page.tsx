'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, CalendarSearch } from 'lucide-react';
import { useAuthStore } from '@/features/auth/hooks/use-auth-store';
import { isDepartmentLeader } from '@/features/auth/lib/is-department-leader';
import { DepartmentLeaveCalendarView } from '@/features/leave/components/department-leave-calendar-view';

export default function LeaveDepartmentHistoryPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const leaderFlag = useAuthStore((s) => s.user?.leader_flag);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isLoggedIn()) {
      router.replace('/login');
      return;
    }
    if (!isDepartmentLeader(leaderFlag)) {
      router.replace('/menu');
    }
  }, [mounted, isLoggedIn, leaderFlag, router]);

  if (!mounted) return null;

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-gray-100 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 active:bg-gray-200"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <CalendarSearch className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-gray-900">
              연차/휴가 조회 (부서장)
            </h1>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DepartmentLeaveCalendarView />
      </div>
    </div>
  );
}
