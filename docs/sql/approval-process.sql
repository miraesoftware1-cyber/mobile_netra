-- ============================================================
-- 승인 절차 관리 - 테이블 및 프로시저 설치 스크립트
-- SQL Server 2008 이상 호환
-- ============================================================

-- ─── 1. 테이블 ───────────────────────────────────────────────

-- 승인 절차 설정 (메뉴별 프로세스 config)
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_PROCESS' AND xtype = 'U')
BEGIN
    CREATE TABLE TB_MOBILE_APVMNG_PROCESS (
        PROC_ID           INT                             NOT NULL,
        PROC_NAME         NVARCHAR(100)                   NULL,
        CONFIG_JSON       NVARCHAR(MAX)                   NOT NULL,
        USE_YN            CHAR(1)                         NOT NULL   DEFAULT 'Y',
        REG_DT            DATETIME                        NOT NULL   DEFAULT GETDATE(),
        UPD_DT            DATETIME                        NULL,
        CREATION_DATE     VARCHAR(14)                     NULL,
        CREATED_BY        VARCHAR(30)                     NULL,
        LAST_UPDATE_DATE  VARCHAR(14)                     NULL,
        LAST_UPDATED_BY   VARCHAR(30)                     NULL,
        CONSTRAINT PK_APVMNG_PROCESS PRIMARY KEY (PROC_ID)
    )
END
GO

-- 승인 요청 (실제 승인 요청 건)
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_REQUEST' AND xtype = 'U')
BEGIN
    CREATE TABLE TB_MOBILE_APVMNG_REQUEST (
        REQ_ID            INT                             NOT NULL,
        MENU_ID           NVARCHAR(50)                    NOT NULL,
        REQ_EMP_CODE      NVARCHAR(50)                    NOT NULL,
        REQ_EMP_NAME      NVARCHAR(100)                   NULL,
        PAYLOAD_JSON      NVARCHAR(MAX)                   NOT NULL,
        PROC_SNAPSHOT     NVARCHAR(MAX)                   NOT NULL,
        TOTAL_STEPS       INT                             NOT NULL   DEFAULT 1,
        CURRENT_STEP      INT                             NOT NULL   DEFAULT 1,
        STATUS            NVARCHAR(20)                    NOT NULL   DEFAULT 'PENDING',
        -- STATUS: PENDING(대기) / APPROVED(승인완료) / REJECTED(반려)
        REG_DT            DATETIME                        NOT NULL   DEFAULT GETDATE(),
        UPD_DT            DATETIME                        NULL,
        CREATION_DATE     VARCHAR(14)                     NULL,
        CREATED_BY        VARCHAR(30)                     NULL,
        LAST_UPDATE_DATE  VARCHAR(14)                     NULL,
        LAST_UPDATED_BY   VARCHAR(30)                     NULL,
        CONSTRAINT PK_APVMNG_REQUEST PRIMARY KEY (REQ_ID)
    )
END
GO

-- 단계별 승인자 (JSON 파싱 불가 대비 정규화 테이블)
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_STEP_APV' AND xtype = 'U')
BEGIN
    CREATE TABLE TB_MOBILE_APVMNG_STEP_APV (
        SA_ID             INT                             NOT NULL,
        REQ_ID            INT                             NOT NULL,
        STEP_NO           INT                             NOT NULL,
        APV_TYPE          NVARCHAR(20)                    NOT NULL,  -- INDIVIDUAL / GROUP / DEPT_HEAD
        EMP_CODE          NVARCHAR(50)                    NOT NULL,
        THRESHOLD         INT                             NOT NULL   DEFAULT 1,
        CREATION_DATE     VARCHAR(14)                     NULL,
        CREATED_BY        VARCHAR(30)                     NULL,
        LAST_UPDATE_DATE  VARCHAR(14)                     NULL,
        LAST_UPDATED_BY   VARCHAR(30)                     NULL,
        CONSTRAINT PK_APVMNG_STEP_APV PRIMARY KEY (SA_ID)
    )
END
GO

-- 승인 처리 이력
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_ACTION' AND xtype = 'U')
BEGIN
    CREATE TABLE TB_MOBILE_APVMNG_ACTION (
        ACT_ID            INT                             NOT NULL,
        REQ_ID            INT                             NOT NULL,
        STEP_NO           INT                             NOT NULL,
        APV_CODE          NVARCHAR(50)                    NOT NULL,
        APV_NAME          NVARCHAR(100)                   NULL,
        ACTION            NVARCHAR(20)                    NOT NULL,  -- APPROVE / REJECT
        COMMENT           NVARCHAR(500)                   NULL,
        ACT_DT            DATETIME                        NOT NULL   DEFAULT GETDATE(),
        CREATION_DATE     VARCHAR(14)                     NULL,
        CREATED_BY        VARCHAR(30)                     NULL,
        LAST_UPDATE_DATE  VARCHAR(14)                     NULL,
        LAST_UPDATED_BY   VARCHAR(30)                     NULL,
        CONSTRAINT PK_APVMNG_ACTION PRIMARY KEY (ACT_ID)
    )
END
GO

-- ─── 2. 프로시저 ─────────────────────────────────────────────
-- ※ usp_mobile_apvmng_process_get 은 mybuilder-workflow.sql 에서 생성

-- 승인 요청 생성
-- param: MENU_ID, REQ_EMP_CODE, REQ_EMP_NAME, PAYLOAD_JSON, PROC_SNAPSHOT,
--        TOTAL_STEPS, APV_LIST (쉼표구분: STEP_NO|APV_TYPE|EMP_CODE|THRESHOLD)
IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_request_create' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_request_create
GO
CREATE PROCEDURE usp_mobile_apvmng_request_create
    @MENU_ID        NVARCHAR(50),
    @REQ_EMP_CODE   NVARCHAR(50),
    @REQ_EMP_NAME   NVARCHAR(100),
    @PAYLOAD_JSON   NVARCHAR(MAX),
    @PROC_SNAPSHOT  NVARCHAR(MAX),
    @TOTAL_STEPS    INT
AS
BEGIN
    SET NOCOUNT ON

    BEGIN TRY
        DECLARE @REQ_ID INT
        SET @REQ_ID = COALESCE((SELECT MAX(REQ_ID) FROM TB_MOBILE_APVMNG_REQUEST), 0) + 1

        INSERT INTO TB_MOBILE_APVMNG_REQUEST
            (REQ_ID, MENU_ID, REQ_EMP_CODE, REQ_EMP_NAME, PAYLOAD_JSON, PROC_SNAPSHOT,
             TOTAL_STEPS, CURRENT_STEP, STATUS, REG_DT)
        VALUES
            (@REQ_ID, @MENU_ID, @REQ_EMP_CODE, @REQ_EMP_NAME, @PAYLOAD_JSON, @PROC_SNAPSHOT,
             @TOTAL_STEPS, 1, 'PENDING', GETDATE())

        SELECT '0' AS Flag, '승인 요청이 생성되었습니다.' AS MSG, @REQ_ID AS REQ_ID
    END TRY
    BEGIN CATCH
        SELECT '1' AS Flag, ERROR_MESSAGE() AS MSG, 0 AS REQ_ID
    END CATCH
END
GO

-- 단계 승인자 등록 (요청 생성 후 단계별 호출)
IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_step_apv_add' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_step_apv_add
GO
CREATE PROCEDURE usp_mobile_apvmng_step_apv_add
    @REQ_ID     INT,
    @STEP_NO    INT,
    @APV_TYPE   NVARCHAR(20),
    @EMP_CODE   NVARCHAR(50),
    @THRESHOLD  INT
AS
BEGIN
    SET NOCOUNT ON

    BEGIN TRY
        INSERT INTO TB_MOBILE_APVMNG_STEP_APV (SA_ID, REQ_ID, STEP_NO, APV_TYPE, EMP_CODE, THRESHOLD)
        VALUES (COALESCE((SELECT MAX(SA_ID) FROM TB_MOBILE_APVMNG_STEP_APV), 0) + 1,
                @REQ_ID, @STEP_NO, @APV_TYPE, @EMP_CODE, @THRESHOLD)

        SELECT '0' AS Flag, '' AS MSG
    END TRY
    BEGIN CATCH
        SELECT '1' AS Flag, ERROR_MESSAGE() AS MSG
    END CATCH
END
GO

-- 내 승인 대기 목록
IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_request_list' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_request_list
GO
CREATE PROCEDURE usp_mobile_apvmng_request_list
    @EMP_CODE   NVARCHAR(50),
    @STATUS     NVARCHAR(20)    -- PENDING / APPROVED / REJECTED / ALL
AS
BEGIN
    SET NOCOUNT ON

    SELECT
        '0'             AS Flag,
        ''              AS MSG,
        R.REQ_ID,
        R.MENU_ID,
        R.REQ_EMP_CODE,
        R.REQ_EMP_NAME,
        R.PAYLOAD_JSON,
        R.PROC_SNAPSHOT,
        R.TOTAL_STEPS,
        R.CURRENT_STEP,
        R.STATUS,
        R.REG_DT,
        -- 현재 단계에서 내가 처리한 이력 여부
        CASE
            WHEN EXISTS (
                SELECT 1 FROM TB_MOBILE_APVMNG_ACTION
                WHERE REQ_ID = R.REQ_ID
                  AND STEP_NO = R.CURRENT_STEP
                  AND APV_CODE = @EMP_CODE
            ) THEN 'Y'
            ELSE 'N'
        END             AS ALREADY_ACTED,
        -- 이 단계에서의 승인 수
        (
            SELECT COUNT(*)
            FROM TB_MOBILE_APVMNG_ACTION
            WHERE REQ_ID = R.REQ_ID
              AND STEP_NO = R.CURRENT_STEP
              AND ACTION = 'APPROVE'
        )               AS STEP_APPROVE_CNT,
        SA.THRESHOLD    AS STEP_THRESHOLD
    FROM TB_MOBILE_APVMNG_REQUEST R
    INNER JOIN TB_MOBILE_APVMNG_STEP_APV SA
        ON SA.REQ_ID = R.REQ_ID
        AND SA.STEP_NO = R.CURRENT_STEP
        AND SA.EMP_CODE = @EMP_CODE
    WHERE
        (@STATUS = 'ALL' OR R.STATUS = @STATUS)
    ORDER BY R.REG_DT DESC
END
GO

-- 승인 요청 상세
IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_request_detail' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_request_detail
GO
CREATE PROCEDURE usp_mobile_apvmng_request_detail
    @REQ_ID     INT
AS
BEGIN
    SET NOCOUNT ON

    SELECT
        '0'             AS Flag,
        ''              AS MSG,
        R.REQ_ID,
        R.MENU_ID,
        R.REQ_EMP_CODE,
        R.REQ_EMP_NAME,
        R.PAYLOAD_JSON,
        R.PROC_SNAPSHOT,
        R.TOTAL_STEPS,
        R.CURRENT_STEP,
        R.STATUS,
        R.REG_DT
    FROM TB_MOBILE_APVMNG_REQUEST R
    WHERE R.REQ_ID = @REQ_ID

    -- 처리 이력도 함께
    SELECT
        ACT_ID,
        REQ_ID,
        STEP_NO,
        APV_CODE,
        APV_NAME,
        ACTION,
        COMMENT,
        ACT_DT
    FROM TB_MOBILE_APVMNG_ACTION
    WHERE REQ_ID = @REQ_ID
    ORDER BY ACT_DT
END
GO

-- ─── 단계별 승인자 조회 ───────────────────────────────────────

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_step_approvers' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_step_approvers
GO

CREATE PROCEDURE usp_mobile_apvmng_step_approvers
    @REQ_ID  INT,
    @STEP_NO INT
AS
BEGIN
    SET NOCOUNT ON
    SELECT EMP_CODE
    FROM TB_MOBILE_APVMNG_STEP_APV WITH(NOLOCK)
    WHERE REQ_ID = @REQ_ID AND STEP_NO = @STEP_NO
END
GO

-- ─── 요청자 코드 조회 (알림용) ───────────────────────────────────

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_req_info' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_req_info
GO

CREATE PROCEDURE usp_mobile_apvmng_req_info
    @REQ_ID INT
AS
BEGIN
    SET NOCOUNT ON
    SELECT REQ_EMP_CODE, MENU_ID, REQ_EMP_NAME, PAYLOAD_JSON
    FROM TB_MOBILE_APVMNG_REQUEST WITH(NOLOCK)
    WHERE REQ_ID = @REQ_ID
END
GO

-- ─── 직원 전체 목록 (파라미터 없음 - 전체 조회용) ─────────────

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_emp_list' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_emp_list
GO

CREATE PROCEDURE usp_mobile_apvmng_emp_list
    @PARAM1 NVARCHAR(100) = ''  -- R2JsonProc.asp 호환용 더미
AS
BEGIN
    SET NOCOUNT ON

    SELECT TOP 1000
        e.emp_code  AS EMP_CODE,
        e.emp_name  AS EMP_NAME,
        ISNULL(d.dpt_name, '') AS DPT_NAME
    FROM mst_emp e WITH(NOLOCK)
    LEFT JOIN mst_dpt d WITH(NOLOCK)
        ON d.corp_code = e.corp_code AND d.dpt_code = e.dpt_code
    WHERE ISNULL(e.ter_date, '') = ''
    ORDER BY e.emp_name
END
GO

-- ─── 직원 검색 프로시저 (키워드 필수) ────────────────────────────

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_emp_search' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_emp_search
GO

CREATE PROCEDURE usp_mobile_apvmng_emp_search
    @KEYWORD NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON

    SELECT TOP 50
        e.emp_code  AS EMP_CODE,
        e.emp_name  AS EMP_NAME,
        ISNULL(d.dpt_name, '') AS DPT_NAME
    FROM mst_emp e WITH(NOLOCK)
    LEFT JOIN mst_dpt d WITH(NOLOCK)
        ON d.corp_code = e.corp_code AND d.dpt_code = e.dpt_code
    WHERE ISNULL(e.ter_date, '') = ''
      AND (
          e.emp_name LIKE '%' + @KEYWORD + '%'
          OR e.emp_code LIKE '%' + @KEYWORD + '%'
      )
    ORDER BY e.emp_name
END
GO

-- ─── 사용자 그룹 목록 (그룹 단계용) ─────────────────────────────

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_group_list' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_group_list
GO

CREATE PROCEDURE usp_mobile_apvmng_group_list
    @PARAM1 NVARCHAR(100) = ''  -- R2JsonProc.asp 호환용 더미
AS
BEGIN
    SET NOCOUNT ON

    SELECT
        USER_ID   AS EMP_CODE,
        USER_NAME AS EMP_NAME,
        ''        AS DPT_NAME
    FROM ENV_USER WITH(NOLOCK)
    WHERE USER_TYPE = 'G'
    ORDER BY USER_ID
END
GO

-- ─── 그룹 멤버 조회 (USER_GROUP 기준 개인 목록) ─────────────────

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_group_members' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_group_members
GO

CREATE PROCEDURE usp_mobile_apvmng_group_members
    @PARAM1 NVARCHAR(100) = ''  -- GROUP_CODE (ENV_USER.USER_GROUP 값, e.g. '_신입사원')
AS
BEGIN
    SET NOCOUNT ON

    SELECT
        USER_ID   AS EMP_CODE,
        USER_NAME AS EMP_NAME,
        ''        AS DPT_NAME
    FROM ENV_USER WITH(NOLOCK)
    WHERE USER_GROUP = @PARAM1
      AND USER_TYPE = 'U'
    ORDER BY USER_ID
END
GO

-- ─── 단계 상태 조회 (THRESHOLD 포함) ────────────────────────────
-- 호출: param1=REQ_ID, param2=USER_ID(ERP 로그인 ID)
-- 반환: CURRENT_STEP, TOTAL_STEPS, STATUS, THRESHOLD

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_step_state' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_step_state
GO

CREATE PROCEDURE usp_mobile_apvmng_step_state
    @REQ_ID  INT,
    @USER_ID NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON

    SELECT
        '0'             AS Flag,
        ''              AS MSG,
        R.CURRENT_STEP,
        R.TOTAL_STEPS,
        R.STATUS,
        ISNULL(SA.THRESHOLD, 1) AS THRESHOLD
    FROM TB_MOBILE_APVMNG_REQUEST R WITH(NOLOCK)
    LEFT JOIN TB_MOBILE_APVMNG_STEP_APV SA WITH(NOLOCK)
        ON SA.REQ_ID  = R.REQ_ID
        AND SA.STEP_NO = R.CURRENT_STEP
        AND SA.EMP_CODE = @USER_ID
    WHERE R.REQ_ID = @REQ_ID
END
GO

-- ─── 단계 상태 업데이트 (승인/반려/다음단계 이동) ────────────────
-- 호출: param1=REQ_ID, param2=STATUS(APPROVED/REJECTED/PENDING), param3=STEP_NO
-- STATUS=PENDING이고 STEP_NO가 현재보다 크면 다음 단계로 이동

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_set_step' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_set_step
GO

CREATE PROCEDURE usp_mobile_apvmng_set_step
    @REQ_ID   INT,
    @STATUS   NVARCHAR(20),   -- APPROVED / REJECTED / PENDING
    @STEP_NO  INT             -- 다음 단계 번호 (PENDING 이동 시) 또는 현재 단계
AS
BEGIN
    SET NOCOUNT ON

    BEGIN TRY
        IF @STATUS = 'PENDING'
        BEGIN
            -- 다음 단계로 이동
            UPDATE TB_MOBILE_APVMNG_REQUEST
            SET CURRENT_STEP = @STEP_NO,
                UPD_DT       = GETDATE()
            WHERE REQ_ID = @REQ_ID
        END
        ELSE
        BEGIN
            -- 최종 승인 또는 반려
            UPDATE TB_MOBILE_APVMNG_REQUEST
            SET STATUS  = @STATUS,
                UPD_DT  = GETDATE()
            WHERE REQ_ID = @REQ_ID
        END

        SELECT '0' AS Flag, '' AS MSG
    END TRY
    BEGIN CATCH
        SELECT '1' AS Flag, ERROR_MESSAGE() AS MSG
    END CATCH
END
GO

-- ─── 끝 ──────────────────────────────────────────────────────
