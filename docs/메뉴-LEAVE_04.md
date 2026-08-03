# 부서 휴가 캘린더 (LEAVE_04)

## 개요

- **경로**: `src/app/(main)/LEAVE/LEAVE_04/page.tsx` → `features/leave/components/department-leave-calendar-view.tsx`
- **접근 권한**: 부서장 전용 (`leader_flag` 확인 — 아닐 경우 `/menu`로 리다이렉트)
- 부서장이 관리 부서 전체의 월별 휴가 현황을 캘린더로 조회한다.

## 구현 방식

- `manage_dpt_codes`가 없으면 쿼리 비활성화 → "부서 조회 권한 정보가 없어" 에러 표시.
- `leaveDayMap`: 날짜별 휴가 목록 Map. 주말(토/일)은 의도적으로 제외.
- 월 이동 시 `selectedDate`도 같은 방향으로 한 달 이동.
- 공휴일 날짜는 빨간색으로 표시.

## 작동 흐름

1. 진입 시 연간 부서 휴가 목록(`usp_mobile_get_my_dpt_holiday_list`)과 공휴일 조회
2. 캘린더 그리드: 휴가 있는 날에 인디고 점 표시
3. 날짜 클릭 → 해당 날짜의 이벤트 목록 필터링 (재클릭 시 해제)
4. 월 이동 → 해당 연도 재조회

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/leave/department-holiday-list` | `usp_mobile_get_my_dpt_holiday_list` | param1=corp_code, param2=manage_dpt_codes, param3=year |
| `GET /api/leave/company-holidays-by-corp` | — | 공휴일 |

### 주요 데이터 흐름

| 데이터 | 출처 | 사용처 |
|--------|------|--------|
| 부서 휴가 목록 | ERP `usp_mobile_get_my_dpt_holiday_list` | `leaveDayMap` 구성, 이벤트 카드 목록 |
| 공휴일 | `/api/leave/company-holidays-by-corp` | 날짜 빨간색 표시 |
| `manage_dpt_codes` | Zustand auth store | 쿼리 파라미터, 쿼리 활성화 여부 |
