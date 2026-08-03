# 연차 조회 (LEAVE_03)

## 개요

- **경로**: `src/app/(main)/LEAVE/LEAVE_03/page.tsx` → `features/leave/components/leave-inquiry-view.tsx`
- **접근 권한**: 전체 사용자
- 본인의 연차 잔여 현황과 연도별 신청 이력을 조회한다.

## 구현 방식

- 연도 선택 드롭다운: 현재 연도 ±2년 ~ -20년 범위.
- `hasApiStartDate` 가드: ERP가 날짜 없는 요약 행을 반환하는 경우가 있으며, `year_bdate`가 8자리 미만이면 일수·상태 컬럼을 빈칸으로 표시.
- 사용 연차 = `year_alday - year_reday` (클라이언트 계산).

## 작동 흐름

1. 진입 시 현재 연도로 `usp_mobile_get_holiday_list` 조회
2. 요약 카드: 발생연차 / 사용연차 / 미사용연차
3. 연도 변경 → 재조회

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/leave/holiday-list` | `usp_mobile_get_holiday_list` | param1=corp_code, param2=year, param3=emp_code |

### 상태 뱃지 색상

| app_status 값 | 색상 |
|--------------|------|
| 승인 | 기본(primary) |
| 신청 / 대기 | 보조(secondary) |
| 반려 | 빨강(destructive) |
