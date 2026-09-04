# 승인 관리 모듈 (APVMNG)

## 개요

메뉴별 다단계 승인 절차를 설정하고 처리하는 모바일 네이티브 기능입니다.  
ERP 권한(ENV_MOBILE_PERMIS)과 무관하게 항상 표시되는 STATIC 메뉴입니다.  
신청 → 1단계 승인자 푸시 → 승인 → 다음 단계 푸시 → 최종 완료 시 신청자 푸시까지 자동으로 처리합니다.

## 페이지

| 메뉴 ID | 경로 | 이름 |
|---------|------|------|
| APVMNG_01 | `/APVMNG/APVMNG_01` | 승인 현황 |
| APVMNG_02 | `/APVMNG/APVMNG_02` | 승인 절차 설정 |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/app/(main)/APVMNG/APVMNG_01/page.tsx` | 승인 대기/완료 목록 및 승인 처리 |
| `src/app/(main)/APVMNG/APVMNG_02/page.tsx` | 메뉴별 승인 절차 설정 (단계·승인자·메시지) |
| `src/app/(main)/menu/page.tsx` | STATIC_SECTIONS로 APVMNG 항상 노출 |

## API 라우트

| 경로 | 메서드 | 프로시저 | 설명 |
|------|--------|----------|------|
| `/api/approval/process` | GET | `usp_mobile_apvmng_process_get` | 메뉴별 절차 설정 조회 |
| `/api/approval/process` | POST | `usp_mobile_apvmng_process_save` | 메뉴별 절차 설정 저장 |
| `/api/approval/request` | POST | `usp_mobile_apvmng_request_create` + `usp_mobile_apvmng_step_apv_add` | 승인 요청 생성 및 1단계 푸시 |
| `/api/approval/list` | GET | `usp_mobile_apvmng_request_list` | 내 승인 대기/완료 목록 |
| `/api/approval/detail` | GET | `usp_mobile_apvmng_request_detail` | 승인 요청 상세 |
| `/api/approval/action` | POST | `usp_mobile_apvmng_action` | 승인/반려 처리 + 자동 푸시 |
| `/api/approval/emp-search` | GET | `usp_mobile_apvmng_emp_list` / `usp_mobile_apvmng_emp_search` / `usp_mobile_apvmng_group_list` | 승인자 검색 |

## ERP 프로시저 목록

| 프로시저 | 설명 |
|----------|------|
| `usp_mobile_apvmng_process_get` | 절차 설정 조회 |
| `usp_mobile_apvmng_process_save` | 절차 설정 저장 (없으면 INSERT, 있으면 UPDATE) |
| `usp_mobile_apvmng_request_create` | 승인 요청 생성 → `REQ_ID` 반환 |
| `usp_mobile_apvmng_step_apv_add` | 단계별 승인자 등록 |
| `usp_mobile_apvmng_request_list` | 내가 처리해야 할 목록 조회 |
| `usp_mobile_apvmng_request_detail` | 요청 상세 + 처리 이력 |
| `usp_mobile_apvmng_action` | 승인/반려 처리 → `NEW_STATUS`, `NEXT_STEP_NO` 반환 |
| `usp_mobile_apvmng_step_approvers` | 특정 단계 승인자 목록 (푸시용) |
| `usp_mobile_apvmng_req_info` | 요청자 코드·이름·메뉴 ID 조회 (알림용) |
| `usp_mobile_apvmng_emp_list` | 직원 전체 목록 (TOP 200) |
| `usp_mobile_apvmng_emp_search` | 직원 검색 (이름·사번 키워드) |
| `usp_mobile_apvmng_group_list` | 사용자 그룹 목록 (`ENV_USER WHERE USER_TYPE='G'`) |

## ERP 테이블

| 테이블 | 설명 |
|--------|------|
| `TB_MOBILE_APVMNG_PROCESS` | 메뉴별 절차 설정 (CONFIG_JSON) |
| `TB_MOBILE_APVMNG_REQUEST` | 승인 요청 건 (STATUS: PENDING / APPROVED / REJECTED) |
| `TB_MOBILE_APVMNG_STEP_APV` | 단계별 승인자 목록 |
| `TB_MOBILE_APVMNG_ACTION` | 승인/반려 처리 이력 |

## 승인 절차 흐름

```
연차 신청 (LEAVE_01 제출)
  └─▶ usp_mobile_insert_holiday (ERP 저장)
  └─▶ /api/approval/process 확인 (LEAVE_01 절차 설정 여부)
        ├─ 절차 없음: 기존 부서장 직접 푸시
        └─ 절차 있음: /api/approval/request 호출
              └─▶ usp_mobile_apvmng_request_create (REQ_ID 생성)
              └─▶ usp_mobile_apvmng_step_apv_add (단계별 승인자 등록)
              └─▶ 1단계 승인자에게 푸시 알림

승인자가 APVMNG_01에서 승인
  └─▶ /api/approval/action 호출
        └─▶ usp_mobile_apvmng_action → NEW_STATUS, NEXT_STEP_NO 반환
              ├─ NEXT_STEP_NO > 0: 다음 단계 승인자 조회 → 푸시
              └─ NEW_STATUS = APPROVED/REJECTED: 요청자에게 최종 결과 푸시
```

## 승인자 타입

| 타입 | 설명 | 피커 동작 |
|------|------|-----------|
| `individual` (개인) | 특정 직원 1명 지정 | 선택 즉시 닫힘, 1명만 유지 |
| `group` (그룹) | ERP 사용자 그룹 (`ENV_USER`) 다중 선택 | 완료 버튼으로 닫힘, threshold 설정 가능 |
| `dept_head` (부서장) | 신청자 소속 부서장 자동 배정 | 선택 불필요 |

## 지원 메뉴

APVMNG_02에서 절차를 설정할 수 있는 메뉴:

| 메뉴 ID | 이름 |
|---------|------|
| LEAVE_01 | 연차 신청 |
| EXP_01 | 지출 결의 |

## 설치

`docs/sql/approval-process.sql` 전체를 ERP DB(SQL Server)에서 실행합니다.  
테이블 4개 + 프로시저 13개가 생성됩니다.
