# 승인 관리 모듈 (APVMNG)

## 개요

메뉴별 다단계 승인 절차를 설정하고 처리하는 모바일 네이티브 기능입니다.  
메뉴 표시 및 페이지 제목은 ERP DB(`usp_mobile_get_env_mobile_menu`) 기반으로 동작합니다.  
신청 → 1단계 승인자 푸시 → 승인 → 다음 단계 푸시 → 최종 완료 시 신청자 푸시까지 자동 처리합니다.

## 페이지

| 메뉴 ID | 경로 | 이름 |
|---------|------|------|
| APVMNG_01 | `/APVMNG/APVMNG_01` | 승인 현황 (대기/완료 목록, 승인·반려 처리) |
| APVMNG_02 | `/APVMNG/APVMNG_02` | 승인 절차 설정 (단계·승인자·메시지 설정) |
| APVMNG_03 | `/APVMNG/APVMNG_03` | 승인 절차 현황 (설정된 프로세스 전체 읽기 전용 뷰) |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/app/(main)/APVMNG/APVMNG_01/page.tsx` | 승인 대기/완료 목록 및 승인 처리 |
| `src/app/(main)/APVMNG/APVMNG_02/page.tsx` | 메뉴별 승인 절차 설정 (MyBuilder 관리) |
| `src/app/(main)/APVMNG/APVMNG_03/page.tsx` | 설정된 프로세스 타임라인 조회 (읽기 전용) |
| `src/app/(main)/menu/page.tsx` | ERP DB 기반 메뉴 목록 (use_yn·권한 연동) |
| `docs/sql/approval-process.sql` | 승인 관련 테이블 4개 + 앱용 SP (최초 설치) |
| `docs/sql/mybuilder-workflow.sql` | PROCESS_STEP·MENU_MAP 테이블 + MyBuilder CRUD 쿼리 |
| `docs/sql/approval-sp-alter.sql` | ERP 등록용 ALTER PROCEDURE 11개 (`usp_mobile_apvmng_get_hierarchy`는 ERP에 별도 등록, 이 파일에 미포함) |

## API 라우트

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/approval/process` | GET | 메뉴별 절차 설정 조회 (ERP) + 푸시 메시지 오버레이 (PG `netra_apvmng_step_msg`) |
| `/api/approval/list` | GET | 내 승인 대기/완료 목록 |
| `/api/approval/detail` | GET | 승인 요청 상세 + 현재 단계 승인자 목록 |
| `/api/approval/action` | POST | 승인/반려 처리 + 자동 푸시 |
| `/api/approval/process` | POST | 단계별 푸시 메시지 저장 (PG `netra_apvmng_step_msg`만 저장, 단계 설정 자체는 MyBuilder) |
| `/api/approval/emp-search` | GET | 승인자 검색 (직원·그룹, `listType=emp\|group`) |
| `/api/push/erp-notify` | POST | ERP(MyBuilder sp_OACreate)에서 직접 푸시 트리거용 |

## ERP 테이블 (MSSQL)

`docs/sql/approval-process.sql` + `docs/sql/mybuilder-workflow.sql` 실행 시 생성됩니다.  
SQL Server 2008 이상 호환. IDENTITY·FK·UNIQUE 없음 (ERP 배포 규칙).

> **REQ_ID / SA_ID는 IDENTITY 컬럼** — SP에서 `SCOPE_IDENTITY()`로 반환.

### 앱 운영 테이블

| 테이블 | 설명 |
|--------|------|
| `TB_MOBILE_APVMNG_REQUEST` | 승인 요청 건 (STATUS: PENDING / APPROVED / REJECTED). REQ_ID는 IDENTITY |
| `TB_MOBILE_APVMNG_STEP_APV` | 요청별 단계별 승인자 목록 (APV_TYPE: step_type 코드). SA_ID는 IDENTITY |
| `TB_MOBILE_APVMNG_ACTION` | 승인/반려 처리 이력 — R2JsonProc.asp INSERT 불가로 **현재 미사용**, PG로 대체 |

### MyBuilder 관리 테이블

| 테이블 | 설명 |
|--------|------|
| `TB_MOBILE_APVMNG_PROCESS` | 워크플로우 정의 (PROC_NAME, USE_YN) |
| `TB_MOBILE_APVMNG_PROCESS_STEP` | 워크플로우 단계 템플릿 (STEP_TYPE, PUSH_YN, MSG_TITLE, MSG_BODY). APV_CODE·APV_NAME·THRESHOLD 컬럼은 삭제됨 — 승인자는 조직도 SP로 동적 조회 |
| `TB_MOBILE_APVMNG_MENU_MAP` | 메뉴 ↔ 워크플로우 연결 (MENU_ID, PROC_ID, USE_YN) |

## ERP 프로시저 목록

`docs/sql/approval-sp-alter.sql`에 ALTER PROCEDURE 형식으로 전부 포함됩니다.  
SQL Server 2008 이상 호환 (OPENJSON 미사용).

| 프로시저 | R2JsonProc 파라미터 | 설명 |
|----------|---------------------|------|
| `usp_mobile_apvmng_process_get` | param1=MENU_ID | MENU_MAP → PROCESS_STEP 조회 (앱에서 워크플로우 단계 확인) |
| `usp_mobile_apvmng_get_hierarchy` | param1=CORP_CODE, param2=DPT_CODE, param3=EMP_CODE | 조직도 계층 조회 → step_type별 승인자(EMP_CODE, EMP_NAME) 반환 |
| `usp_mobile_apvmng_request_create` | param1=MENU_ID, param2=EMP_CODE, param3=EMP_NAME, param4=PAYLOAD_JSON, param5=PROC_SNAPSHOT, param6=TOTAL_STEPS | 승인 요청 생성 → SCOPE_IDENTITY()로 REQ_ID 반환 |
| `usp_mobile_apvmng_step_apv_add` | param1=REQ_ID, param2=STEP_NO, param3=APV_TYPE, param4=EMP_CODE | 단계별 승인자 1건 등록 (요청 생성 후 반복 호출). THRESHOLD 파라미터 없음 |
| `usp_mobile_apvmng_request_list` | param1=EMP_CODE, param2=STATUS | 내가 처리해야 할 목록 조회. THRESHOLD는 1로 하드코딩 |
| `usp_mobile_apvmng_request_detail` | param1=REQ_ID | 요청 상세 + 처리 이력 (2개 resultset) |
| `usp_mobile_apvmng_step_approvers` | param1=REQ_ID, param2=STEP_NO | 특정 단계 승인자 목록 (푸시용) |
| `usp_mobile_apvmng_req_info` | param1=REQ_ID | 요청자 코드·이름·메뉴ID 조회 (알림용) |
| `usp_mobile_apvmng_step_state` | param1=REQ_ID, param2=USER_ID | 현재 단계 상태 조회 (승인 처리 전 검증). THRESHOLD는 1로 하드코딩 |
| `usp_mobile_apvmng_set_step` | param1=REQ_ID, param2=STATUS, param3=STEP_NO | 요청 STATUS / CURRENT_STEP 갱신 |
| `usp_mobile_apvmng_emp_lookup` | param1=KEYWORD | 직원 조회: KEYWORD 없으면 전체(TOP 1000), 있으면 검색(TOP 50) |
| `usp_mobile_apvmng_group_lookup` | param1=TARGET | 그룹 조회: TARGET 없으면 그룹 목록, 있으면 해당 그룹 멤버 |

> **R2JsonProc.asp INSERT 제한**: `TB_MOBILE_APVMNG_ACTION`에 대한 INSERT는 ASP 레벨에서 HTTP 500을 반환합니다.  
> 액션 기록은 PostgreSQL `netra_apvmng_actions`에 저장하고, ERP에는 `usp_mobile_apvmng_set_step`(UPDATE)만 씁니다.

## PostgreSQL 테이블

| 테이블 | 설명 |
|--------|------|
| `netra_apvmng_actions` | 승인/반려 처리 이력 (req_id, step_no, apv_code, action, comment) — ERP INSERT 불가 우회 |
| `netra_apvmng_requests` | 연차 신청 → 승인 요청 매핑 (emp_code, year, year_seq, start_date → req_id). 취소 시 req_id 역참조용 |
| `netra_cancelled_reqs` | 취소된 req_id 목록. 승인 대기 목록 필터링에 사용 |
| `netra_apvmng_step_msg` | 단계별 푸시 메시지 커스텀 설정 (menu_id, step_type, msg_title, msg_body). ERP 기본값 오버라이드용. UNIQUE(menu_id, step_type) |

## 승인 절차 흐름

```
연차 신청 (LEAVE_01 제출)
  ├─ usp_mobile_insert_holiday (ERP 연차 저장) [동기]
  └─ prepareApproval() [동기 — 취소 연동 보장]
       ├─ usp_mobile_apvmng_process_get (LEAVE_01 단계 설정 조회)
       │    ├─ 절차 없음(Flag≠0): fallback — 부서장(manage_dpt_codes)에게 직접 푸시
       │    └─ 절차 있음:
       │          ├─ usp_mobile_apvmng_get_hierarchy (corp_code, dpt_code, emp_code)
       │          │    → step_type별 승인자 EMP_CODE 반환
       │          ├─ requester 단계 → 승인 체인 제외, requesterPush로만 처리
       │          ├─ usp_mobile_apvmng_request_create → SCOPE_IDENTITY()로 REQ_ID 반환
       │          ├─ netra_apvmng_requests에 req_id 매핑 저장 (취소 연동용)
       │          └─ usp_mobile_apvmng_step_apv_add × N (단계별 승인자 병렬 등록)
  └─ after() [응답 후 비동기]
       ├─ requester 단계 push_enabled=Y면 신청자에게 접수 확인 푸시
       └─ step1 승인자에게 승인 요청 푸시 (pushCfg 버튼 설정 포함)

승인자가 APVMNG_01에서 승인/반려
  └─ POST /api/approval/action
       ├─ usp_mobile_apvmng_step_state (현재 단계 상태 조회. THRESHOLD=1 고정)
       ├─ netra_apvmng_actions에 액션 기록 (PG)
       ├─ TypeScript에서 다음 상태 계산
       └─ usp_mobile_apvmng_set_step (ERP STATUS/STEP 갱신)
             ├─ 다음 단계: 다음 단계 승인자에게 푸시
             ├─ 최종 승인: 요청자 푸시 + LEAVE_01이면 ERP 연차 상태 UPDATE
             └─ 반려: 요청자 푸시 + LEAVE_01이면 ERP 연차 취소

연차 취소
  ├─ usp_mobile_cancel_holiday (ERP 연차 삭제)
  ├─ netra_apvmng_requests에서 req_id 조회 (year_seq 또는 start_date 기준)
  └─ after() 비동기:
       ├─ netra_cancelled_reqs에 req_id 기록
       ├─ usp_mobile_apvmng_request_detail + usp_mobile_apvmng_set_step STATUS=REJECTED (병렬)
       ├─ 현재 단계 승인자에게 취소 푸시
       └─ netra_apvmng_actions / netra_apvmng_requests PG 정리
```

## step_type 코드

단계별 승인자는 MyBuilder에서 STEP_TYPE을 지정하면 `usp_mobile_apvmng_get_hierarchy`가 실행 시 조직도에서 동적으로 조회한다.

| step_type | 설명 |
|-----------|------|
| `requester` | 담당(신청자 본인) — 승인 체인 제외, 접수 확인 푸시만 발송 |
| `team_leader` | 팀장 |
| `dept_head` | 부서장 |
| `div_head` | 본부장 |
| `ceo` | 대표 |

승인 체인에서 실제 승인 처리는 `requester` 를 제외한 step_type부터 시작한다 (팀장 → 부서장 → 본부장 → 대표 순).

## 지원 메뉴

| 메뉴 ID | 이름 |
|---------|------|
| LEAVE_01 | 연차 신청 |
| EXP_01 | 지출 결의 |

## user_id ≠ emp_code 거래처 대응

거래처에 따라 ERP 로그인 ID(`user_id`)와 사번(`emp_code`)이 다를 수 있습니다.

- **승인 목록 조회**: userId와 empCode 양쪽으로 ERP 조회 후 REQ_ID 기준 중복 제거 (`fetchMerged`)
- **푸시 발송**: `netra_push_subs.user_id` 조회 → 0건이면 `emp_code`로 폴백 조회
- 이 패턴은 `/api/approval/list`, `/api/approval/action`, `/api/leave/request`, `/api/leave/cancel` 전체에 적용됨

## 설치

1. `docs/sql/approval-process.sql` 실행 — 앱 운영 테이블 4개 + SP 생성
2. `docs/sql/mybuilder-workflow.sql` 실행 — PROCESS_STEP·MENU_MAP 테이블 + MyBuilder CRUD 쿼리
3. `docs/sql/approval-sp-alter.sql` — ERP에 ALTER PROCEDURE로 SP 11개 등록

이미 설치된 경우 재실행해도 안전합니다(IF NOT EXISTS / ALTER).

## MyBuilder 그리드 구성

승인 절차 설정 화면(APVMNG_02)의 CRUD는 `docs/sql/mybuilder-workflow.sql` Section 4~7 참고.

| 그리드 | 테이블 | 비고 |
|--------|--------|------|
| grd_mst | TB_MOBILE_APVMNG_PROCESS | 워크플로우 목록 |
| grd_itm | TB_MOBILE_APVMNG_PROCESS_STEP | 단계 목록 (grd_mst 선택 연동) |
| grd_msg | TB_MOBILE_APVMNG_PROCESS_STEP | 메시지 폼 (grd_itm 선택 연동) |
| grd_map | TB_MOBILE_APVMNG_MENU_MAP | 메뉴 연결 목록 |
