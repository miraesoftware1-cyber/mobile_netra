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

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/approval/process` | GET | 메뉴별 절차 설정 조회 |
| `/api/approval/process` | POST | 메뉴별 절차 설정 저장 |
| `/api/approval/list` | GET | 내 승인 대기/완료 목록 |
| `/api/approval/detail` | GET | 승인 요청 상세 + 현재 단계 승인자 목록 |
| `/api/approval/action` | POST | 승인/반려 처리 + 자동 푸시 |
| `/api/approval/emp-search` | GET | 승인자 검색 (직원·그룹) |

## ERP 프로시저 목록

| 프로시저 | 읽기/쓰기 | 설명 |
|----------|-----------|------|
| `usp_mobile_apvmng_process_get` | SELECT | 절차 설정 조회 |
| `usp_mobile_apvmng_process_save` | INSERT/UPDATE | 절차 설정 저장 |
| `usp_mobile_apvmng_request_create` | INSERT | 승인 요청 생성 → `REQ_ID` 반환 |
| `usp_mobile_apvmng_step_apv_add` | INSERT | 단계별 승인자 등록 |
| `usp_mobile_apvmng_request_list` | SELECT | 내가 처리해야 할 목록 조회 |
| `usp_mobile_apvmng_request_detail` | SELECT | 요청 상세 |
| `usp_mobile_apvmng_step_approvers` | SELECT | 특정 단계 승인자 목록 (푸시·canAct 판별용) |
| `usp_mobile_apvmng_step_state` | SELECT | 현재 단계 상태 조회 (THRESHOLD, APV_CNT, ALREADY_ACTED) |
| `usp_mobile_apvmng_set_step` | UPDATE | 요청 STATUS / CURRENT_STEP 갱신 |
| `usp_mobile_apvmng_req_info` | SELECT | 요청자 코드·이름·메뉴 ID 조회 (알림용) |
| `usp_mobile_apvmng_emp_list` | SELECT | 직원 전체 목록 (TOP 200) |
| `usp_mobile_apvmng_emp_search` | SELECT | 직원 검색 (이름·사번 키워드) |
| `usp_mobile_apvmng_group_list` | SELECT | 사용자 그룹 목록 (`ENV_USER WHERE USER_TYPE='G'`) |

> **참고**: `usp_mobile_apvmng_action` (원본 승인 처리 SP)은 ERP R2JsonProc.asp를 통한 INSERT 실패 문제로 사용하지 않습니다.  
> 액션 기록은 PostgreSQL `netra_apvmng_actions` 테이블에 저장하고, ERP에는 UPDATE(`usp_mobile_apvmng_set_step`)만 씁니다.

## ERP 테이블

| 테이블 | 설명 |
|--------|------|
| `TB_MOBILE_APVMNG_PROCESS` | 메뉴별 절차 설정 (CONFIG_JSON) |
| `TB_MOBILE_APVMNG_REQUEST` | 승인 요청 건 (STATUS: PENDING / APPROVED / REJECTED / CANCELLED) |
| `TB_MOBILE_APVMNG_STEP_APV` | 단계별 승인자 목록 |
| `TB_MOBILE_APVMNG_ACTION` | 승인/반려 처리 이력 (R2JsonProc.asp INSERT 실패로 현재 미사용) |

## PostgreSQL 테이블

ERP R2JsonProc.asp를 통한 `TB_MOBILE_APVMNG_ACTION` INSERT가 불가능하여 액션 기록을 자체 PG에 저장합니다.

| 테이블 | 설명 |
|--------|------|
| `netra_apvmng_actions` | 승인/반려 처리 이력 (req_id, step_no, apv_code, action, comment) |
| `netra_apvmng_requests` | 연차 신청 → 승인 요청 매핑 (emp_code, year, year_seq → req_id) |

`netra_apvmng_requests`는 연차 취소 시 연동된 승인 요청을 찾기 위한 매핑 테이블입니다.

## 승인 절차 흐름

```
연차 신청 (LEAVE_01 제출)
  └─▶ usp_mobile_insert_holiday (ERP 저장)
  └─▶ usp_mobile_apvmng_process_get 확인 (LEAVE_01 절차 설정 여부)
        ├─ 절차 없음: 기존 부서장 직접 푸시
        └─ 절차 있음:
              └─▶ usp_mobile_apvmng_request_create (REQ_ID 생성)
              └─▶ netra_apvmng_requests에 (emp_code, year, year_seq → req_id) 저장
              └─▶ usp_mobile_apvmng_step_apv_add (단계별 승인자 등록)
              └─▶ 1단계 승인자에게 푸시 알림

승인자가 APVMNG_01에서 승인/반려
  └─▶ POST /api/approval/action
        └─▶ usp_mobile_apvmng_step_state (현재 상태·임계값 조회)
        └─▶ netra_apvmng_actions에 액션 기록 INSERT
        └─▶ TypeScript에서 다음 상태 계산 (threshold 기반)
        └─▶ usp_mobile_apvmng_set_step (ERP 상태 UPDATE)
              ├─ 다음 단계 있음: 다음 단계 승인자에게 푸시
              └─ 최종 완료: 요청자에게 결과 푸시 + LEAVE_01이면 ERP 연차 상태 업데이트

연차 취소
  └─▶ usp_mobile_cancel_holiday (ERP 연차 삭제)
  └─▶ netra_apvmng_requests에서 req_id 조회
  └─▶ usp_mobile_apvmng_set_step STATUS=CANCELLED
  └─▶ netra_apvmng_actions / netra_apvmng_requests PG 정리
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

추가로 아래 SP를 별도 실행해야 합니다 (approval-process.sql 미포함):

```sql
-- 현재 단계 상태 조회 (승인 처리 전 검증용)
CREATE PROCEDURE usp_mobile_apvmng_step_state
    @REQ_ID NVARCHAR(20), @APV_CODE NVARCHAR(50)
AS BEGIN
    SET NOCOUNT ON
    SELECT '0' AS Flag,
        R.CURRENT_STEP, R.TOTAL_STEPS, R.STATUS,
        ISNULL(SA.THRESHOLD, 1) AS THRESHOLD,
        (SELECT COUNT(DISTINCT APV_CODE) FROM TB_MOBILE_APVMNG_ACTION
         WHERE REQ_ID = R.REQ_ID AND STEP_NO = R.CURRENT_STEP AND ACTION = 'APPROVE') AS APV_CNT,
        CASE WHEN EXISTS(SELECT 1 FROM TB_MOBILE_APVMNG_ACTION
             WHERE REQ_ID = R.REQ_ID AND STEP_NO = R.CURRENT_STEP AND APV_CODE = @APV_CODE)
             THEN 1 ELSE 0 END AS ALREADY_ACTED
    FROM TB_MOBILE_APVMNG_REQUEST R
    LEFT JOIN (SELECT REQ_ID, STEP_NO, MAX(THRESHOLD) AS THRESHOLD
               FROM TB_MOBILE_APVMNG_STEP_APV GROUP BY REQ_ID, STEP_NO) SA
        ON SA.REQ_ID = R.REQ_ID AND SA.STEP_NO = R.CURRENT_STEP
    WHERE R.REQ_ID = CAST(@REQ_ID AS INT)
END

-- 요청 상태/단계 갱신 (승인 처리 후 UPDATE)
CREATE PROCEDURE usp_mobile_apvmng_set_step
    @REQ_ID NVARCHAR(20), @STATUS NVARCHAR(20), @STEP_NO NVARCHAR(10)
AS BEGIN
    SET NOCOUNT ON
    BEGIN TRY
        UPDATE TB_MOBILE_APVMNG_REQUEST
        SET STATUS = @STATUS, CURRENT_STEP = CAST(@STEP_NO AS INT), UPD_DT = GETDATE()
        WHERE REQ_ID = CAST(@REQ_ID AS INT)
        SELECT '0' AS Flag, '' AS MSG
    END TRY
    BEGIN CATCH
        SELECT '1' AS Flag, ERROR_MESSAGE() AS MSG
    END CATCH
END
```
