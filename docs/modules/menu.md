# 메뉴 및 권한 관리

## 개요

ERP의 권한관리 데이터를 기반으로 각 사용자가 접근 가능한 메뉴를 동적으로 구성합니다.  
시스템관리자(`user_type=S`)는 권한 데이터 없이도 모든 메뉴에 전체 권한을 가집니다.

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/app/api/menu-visibility/route.ts` | 메뉴 목록 + 권한 조회 API |
| `src/features/menu/use-menu-store.ts` | 메뉴 상태 (Zustand, 비영속) |
| `src/app/(main)/menu/page.tsx` | 전체 메뉴 페이지 |
| `src/app/(main)/layout.tsx` | 메뉴 권한 자동 로드 + 갱신 |
| `src/features/menu-permission/hooks/use-page-permission.ts` | 페이지별 권한 훅 |

## 메뉴 visibility API (`GET /api/menu-visibility`)

### 쿼리 파라미터

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `companyCode` | Y | 회사코드 |
| `userId` | Y | 사용자 ID |
| `userType` | N | 사용자 타입 (`S`이면 전체 권한) |

### 처리 흐름

1. ERP `usp_mobile_get_env_mobile_menu` 프로시저로 활성화된 전체 메뉴 조회
2. `userType === 'S'`이면 전체 메뉴에 CRUD 전체 권한 반환 (DB 조회 없이)
3. 일반 사용자: ERP `usp_mobile_get_env_mobile_permission` 프로시저로 사용자 권한 조회
4. `per_ret=Y`인 메뉴만 필터링 (부모 메뉴도 함께 검증)

### 반환 데이터

```json
{
  "items": [
    { "menu_id": "SCH", "menu_pid": null, "menu_name": "일정관리", "menu_exec": "...", "menu_order": 1 },
    { "menu_id": "SCH_01", "menu_pid": "SCH", "menu_name": "일정 조회", "menu_exec": "/SCH/SCH_01", "menu_order": 1 }
  ],
  "perms": {
    "SCH": { "view": true, "add": true, "edit": true, "del": true }
  }
}
```

## 메뉴 ID 체계

| 대메뉴 ID | 이름 | 소메뉴 |
|-----------|------|--------|
| `LEAVE` | 연차/휴가 | LEAVE_01~04 |
| `EXP` | 지출결의 | EXP_01~02 |
| `DAILY` | 일용직 인사정보 | DAILY_01~02 |
| `SCH` | 일정관리 | SCH_01~02 |

## 메뉴 스토어

비영속 Zustand 스토어. 페이지 새로고침 시 layout.tsx에서 자동으로 재조회합니다.

```ts
interface MenuStore {
  items: MenuDBItem[];   // 접근 가능한 메뉴 목록
  perms: Record<string, MenuPerm>;  // 메뉴별 CRUD 권한
}
```

## 메뉴 갱신 시점

- 앱 최초 로드 (layout.tsx의 useEffect)
- 앱을 백그라운드 → 포그라운드 전환 시 (visibilitychange 이벤트)
- 메뉴 페이지(/menu) 진입 시

## 부서장 전용 메뉴

`leader_flag`가 설정된 사용자만 볼 수 있는 메뉴:

```ts
const LEADER_ONLY_MENU_IDS = new Set(["LEAVE_02", "LEAVE_04"]);
```
