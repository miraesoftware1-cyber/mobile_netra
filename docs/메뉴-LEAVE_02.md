# 연차 승인 (LEAVE_02)

## 개요

- **경로**: `src/app/(main)/LEAVE/LEAVE_02/page.tsx` → `features/leave/components/leave-approval-list.tsx`
- **접근 권한**: 부서장 전용 (`leader_flag` 확인 — 아닐 경우 `/menu`로 리다이렉트)
- 부서장이 자신이 관리하는 부서의 미결재 휴가 신청 목록을 조회하고 일괄 승인/취소한다.

## 구현 방식

- `manage_dpt_codes`가 없으면 쿼리 비활성화 → "세션 정보 만료" 안내 + 재로그인 버튼 표시.
- React Query: `staleTime: 0`, `refetchOnMount: 'always'` — 매 진입마다 최신 데이터 조회.
- 선택 상태: `selectedKeys: Set<string>` (key = `emp_code:year_st:year_seq`).
- 전체 선택 체크박스 + 행별 체크박스.

## 작동 흐름

1. 진입 시 `usp_mobile_get_holiday_unapproved_list`로 미결재 목록 조회
2. 사용자가 행 선택 → "승인하기 (N)" 버튼 클릭 → 확인 다이얼로그
3. 확인 → `R2JsonProc_update_holiday.asp` 호출로 일괄 승인
4. 성공 메시지 다이얼로그 표시 후 목록 갱신

## 연동 관계

| API 경로 | ERP 엔드포인트 | 파라미터 |
|----------|--------------|---------|
| `GET /api/leave/approval-list` | `usp_mobile_get_holiday_unapproved_list` | param1=year, param2=corp_code, param3=manage_dpt_codes |
| `POST /api/leave/approve` | `R2JsonProc_update_holiday.asp` | 선택된 휴가 행 정보 |

### 주요 데이터 흐름

| 데이터 | 출처 | 사용처 |
|--------|------|--------|
| 미결재 휴가 목록 | ERP `usp_mobile_get_holiday_unapproved_list` | 카드 목록, 체크박스 선택 |
| `manage_dpt_codes` | Zustand auth store | 쿼리 파라미터, 부서 라벨 표시 |
