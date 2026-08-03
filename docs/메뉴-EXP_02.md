# 지출결의 조회 (EXP_02)

## 개요

- **경로**: `src/app/(main)/EXP/EXP_02/page.tsx` → `features/expense/components/expense-inquiry-view.tsx`
- **접근 권한**: 전체 사용자
- 본인의 지출결의 이력을 월별로 조회하고 금액 요약(총액·승인·요청)을 확인한다.

## 구현 방식

- 월 선택 드롭다운: 현재 월 포함 최근 12개월.
- `amountSummary`: 조회된 행에서 클라이언트 합산 — `{ total, approved, requested }`.
- `slip_type` 값 이외의 상태는 "요청"으로 기본 처리.

## 작동 흐름

1. 진입 시 현재 월로 `usp_mobile_get_expense_list` 조회
2. 요약 카드: 총 지출금액 / 승인금액 / 요청금액
3. 월 변경 → 재조회

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/expense/expense-list` | `usp_mobile_get_expense_list` | param1=emp_code, param2=yearMonth(YYYYMM) |

### 상태 뱃지 색상

| slip_type 값 | 색상 |
|-------------|------|
| 승인 | 기본(primary) |
| 요청 / 기타 | 보조(secondary) |
| 반려 | 빨강(destructive) |
