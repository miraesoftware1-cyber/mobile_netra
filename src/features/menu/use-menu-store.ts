import { create } from 'zustand';
import type { MenuDBItem, MenuPerm } from '@/app/api/menu-visibility/route';

interface MenuStore {
  items: MenuDBItem[];
  perms: Record<string, MenuPerm>;
  setItems: (items: MenuDBItem[]) => void;
  setPerms: (perms: Record<string, MenuPerm>) => void;
}

export const useMenuStore = create<MenuStore>((set) => ({
  items: [],
  perms: {},
  setItems: (items) => set({ items }),
  setPerms: (perms) => set({ perms }),
}));

export function useMenuTitle(menuId: string, fallback: string): string {
  const items = useMenuStore((s) => s.items);
  return items.find((i) => i.menu_id === menuId)?.menu_name ?? fallback;
}
