import { useMenuStore } from "@/features/menu/use-menu-store";

export type PagePerm = { view: boolean; add: boolean; edit: boolean; del: boolean };

export const FULL_PERM: PagePerm = { view: true, add: true, edit: true, del: true };

export function usePagePermission(menuId: string): PagePerm {
  const perms = useMenuStore((s) => s.perms);
  return perms[menuId] ?? FULL_PERM;
}
