"use client";

import { create } from "zustand";
import type { MenuPerm, MenuDBItem } from "@/app/api/menu-visibility/route";

interface MenuPermStore {
  perms: Record<string, MenuPerm>;
  items: MenuDBItem[];
  setMenuData: (items: MenuDBItem[], perms: Record<string, MenuPerm>) => void;
  getPermByExec: (exec: string) => MenuPerm | null;
}

export const useMenuPermStore = create<MenuPermStore>((set, get) => ({
  perms: {},
  items: [],
  setMenuData: (items, perms) => set({ items, perms }),
  getPermByExec: (exec) => {
    const { items, perms } = get();
    const normalised = exec.toLowerCase().replace(/^\//, "");
    const item = items.find((m) =>
      m.menu_exec?.toLowerCase().replace(/^\//, "") === normalised,
    );
    if (!item) return null;
    return perms[item.menu_id] ?? null;
  },
}));
