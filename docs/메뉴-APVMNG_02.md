# 승인 절차 설정 (APVMNG_02)

## 개요

- **경로**: `src/app/(main)/APVMNG/APVMNG_02/page.tsx`
- **접근 권한**: ERP DB `usp_mobile_get_env_mobile_permission` 기준 (관리자만)
- 메뉴별 다단계 승인 절차(워크플로우)를 설정하는 관리 화면이다.
- **CRUD는 MyBuilder 웹화면에서 처리** — 앱은 설정 결과를 조회·확인하는 용도로 사용.

## 구현 방식

- 지원 메뉴 목록(`LEAVE_01`, `EXP_01`)을 순서대로 표시.
- 각 메뉴 카드에서 ERP `usp_mobile_apvmng_process_get`으로 현재 설정된 단계 조회.
- 단계 유형(STEP_TYPE): `requester`(담당) / `team_leader`(팀장) / `dept_head`(부서장) / `div_head`(본부장) / `ceo`(대표).
  - 승인자는 `usp_mobile_apvmng_get_hierarchy`로 조직도에서 동적 결정 — MyBuilder에서 STEP_TYPE만 설정하면 됨.
  - `requester` 단계는 신청자 본인으로, 승인 체인에서 제외하고 접수 확인 푸시만 발송.
- 단계별 푸시 메시지는 앱 APVMNG_03 화면에서 변경 → PG `netra_apvmng_step_msg`에 저장.

## 작동 흐름

1. 진입 시 지원 메뉴 목록 렌더링
2. 메뉴 카드 펼치기 → `GET /api/approval/process` → 현재 단계 표시
3. MyBuilder에서 PROCESS·PROCESS_STEP·MENU_MAP 테이블 직접 관리
4. 앱은 조회 전용 (단계 추가/삭제/순서 변경은 MyBuilder 담당)

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/approval/process` | `usp_mobile_apvmng_process_get` | param1=MENU_ID |
| `GET /api/approval/emp-search?listType=emp` | `usp_mobile_apvmng_emp_lookup` | param1=KEYWORD |
| `GET /api/approval/emp-search?listType=group` | `usp_mobile_apvmng_group_lookup` | param1= (빈값=그룹목록) |

## MyBuilder 관리 테이블

워크플로우 설정은 MyBuilder `docs/sql/mybuilder-workflow.sql` Section 4~7 참고.

| 그리드 | 테이블 | 설명 |
|--------|--------|------|
| grd_mst | `TB_MOBILE_APVMNG_PROCESS` | 워크플로우 목록 (이름, 사용여부) |
| grd_itm | `TB_MOBILE_APVMNG_PROCESS_STEP` | 단계 목록 (단계번호, STEP_TYPE, PUSH_YN). APV_CODE·APV_NAME·THRESHOLD 없음 |
| grd_msg | `TB_MOBILE_APVMNG_PROCESS_STEP` | 메시지 설정 (푸시 제목·본문). 앱에서 변경 시 PG로 오버라이드 저장 |
| grd_map | `TB_MOBILE_APVMNG_MENU_MAP` | 메뉴 ↔ 워크플로우 연결 (MENU_ID, PROC_ID) |
