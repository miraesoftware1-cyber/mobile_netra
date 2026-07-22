// mobile-netra는 메뉴 권한을 별도로 관리하지 않으므로 전체 권한 부여
export type PagePerm = { view: boolean; add: boolean; edit: boolean; del: boolean };

export const FULL_PERM: PagePerm = { view: true, add: true, edit: true, del: true };
