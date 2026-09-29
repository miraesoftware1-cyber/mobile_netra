# 승인 현황 (APVMNG_01)

## 개요

- **경로**: `src/app/(main)/APVMNG/APVMNG_01/page.tsx`
- **접근 권한**: ERP DB `usp_mobile_get_env_mobile_permission` 기준 (승인 관리자만)
- 내가 처리해야 할 승인 대기 목록과 이미 처리한 완료 목록을 탭으로 구분해 보여준다.
- 요청 상세에서 승인·반려를 처리하면 자동으로 다음 단계 승인자에게 푸시가 발송된다.

## 구현 방식

- 상단 탭: 대기 / 완료 전환 (`STATUS=PENDING` / `STATUS!=PENDING`).
- `user_id ≠ emp_code` 거래처 대응: userId·empCode 양쪽으로 ERP 조회 후 `req_id` 기준 중복 제거(`fetchMerged`).
- 취소된 요청 필터링: PG `netra_cancelled_reqs` 조회 → `req_id` 제외.
- 반려 처리 시 사유 입력 다이얼로그 표시.

## 작동 흐름

1. 진입 시 `GET /api/approval/list` 호출 → 대기 목록 렌더링
2. 탭 전환 시 completed 목록 별도 조회 (캐시 없음)
3. 카드 클릭 → `GET /api/approval/detail` → 상세 다이얼로그 표시
4. 승인 버튼 → `POST /api/approval/action (action=approve)`
5. 반려 버튼 → 사유 입력 → `POST /api/approval/action (action=reject)`
6. 처리 완료 → 목록 자동 갱신

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/approval/list` | `usp_mobile_apvmng_request_list` | param1=EMP_CODE, param2=STATUS |
| `GET /api/approval/detail` | `usp_mobile_apvmng_request_detail` | param1=REQ_ID |
| `POST /api/approval/action` | `usp_mobile_apvmng_step_state` (조회) | param1=REQ_ID, param2=USER_ID |
| | `usp_mobile_apvmng_step_approvers` (푸시대상) | param1=REQ_ID, param2=STEP_NO |
| | `usp_mobile_apvmng_req_info` (요청자정보) | param1=REQ_ID |
| | `usp_mobile_apvmng_set_step` (상태갱신) | param1=REQ_ID, param2=STATUS, param3=STEP_NO |

### 주요 데이터 흐름

| 데이터 | 출처 | 사용처 |
|--------|------|--------|
| 승인 대기 목록 | ERP `usp_mobile_apvmng_request_list` | 카드 리스트 |
| 취소 필터 목록 | PG `netra_cancelled_reqs` | req_id 제외 필터링 |
| 처리 이력 | PG `netra_apvmng_actions` + ERP detail | 상세 다이얼로그 |
| 현재 단계 상태 | ERP `usp_mobile_apvmng_step_state` | threshold 달성 여부 계산 |
| 다음 단계 승인자 | ERP `usp_mobile_apvmng_step_approvers` | 푸시 발송 대상 |
