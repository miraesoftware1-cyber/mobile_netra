'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, CalendarDays, User, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationStore } from '@/features/notifications/use-notification-store';

const TAB_ITEMS = [
  { href: '/menu',          label: '메뉴',   icon: LayoutGrid  },
  { href: '/calendar',      label: '캘린더', icon: CalendarDays },
  { href: '/notifications', label: '알림',   icon: Bell         },
  { href: '/profile',       label: '내 정보', icon: User         },
] as const;

export function BottomTabNav() {
  const pathname    = usePathname();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-stretch h-16">
        {TAB_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive   = pathname === href;
          const showBadge  = href === '/notifications' && unreadCount > 0;

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative',
                isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <div className="relative">
                <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={cn('text-[10px] font-medium', isActive ? 'text-primary' : 'text-gray-400')}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
