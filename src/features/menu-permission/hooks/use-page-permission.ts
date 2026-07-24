import { useMenuStore } from "@/features/menu/use-menu-store";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";

export type PagePerm = { view: boolean; add: boolean; edit: boolean; del: boolean };

export const FULL_PERM: PagePerm = { view: true, add: true, edit: true, del: true };

export function usePagePermission(menuId: string): PagePerm {
  const perms    = useMenuStore((s) => s.perms);
  const userType = useAuthStore((s) => s.user?.user_type ?? "");
  if (userType === "S") return FULL_PERM;
  return perms[menuId] ?? FULL_PERM;
}
