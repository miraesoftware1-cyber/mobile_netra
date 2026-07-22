import { create } from 'zustand';
import type { MenuDBItem } from '@/app/api/menu-visibility/route';

interface MenuStore {
  items: MenuDBItem[];
  setItems: (items: MenuDBItem[]) => void;
}

export const useMenuStore = create<MenuStore>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
}));

export function useMenuTitle(menuId: string, fallback: string): string {
  const items = useMenuStore((s) => s.items);
  return items.find((i) => i.menu_id === menuId)?.menu_name ?? fallback;
}
