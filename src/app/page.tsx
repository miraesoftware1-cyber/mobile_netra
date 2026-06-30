'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/hooks/use-auth-store';

export default function RootPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace('/menu');
    } else {
      router.replace('/login');
    }
  }, [isLoggedIn, router]);

  return null;
}
