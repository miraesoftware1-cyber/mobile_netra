'use client';

import { useEffect } from 'react';
import { useFontSizeStore, FONT_SIZE_CSS } from '@/features/settings/hooks/use-font-size-store';

export function FontSizeProvider() {
  const fontSize = useFontSizeStore((s) => s.fontSize);

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_CSS[fontSize];
  }, [fontSize]);

  return null;
}
