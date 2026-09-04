-- ============================================================
-- 승인 절차 관리 - 테이블 및 프로시저 설치 스크립트
-- SQL Server 2008 이상 호환
-- ============================================================

-- ─── 1. 테이블 ───────────────────────────────────────────────

-- 승인 절차 설정 (메뉴별 프로세스 config)
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_PROCESS' AND xtype = 'U')
BEGIN
    CREATE TABLE TB_MOBILE_APVMNG_PROCESS (
        PROC_ID           INT             IDENTITY(1,1)   NOT NULL,
        MENU_ID           NVARCHAR(50)                    NOT NULL,
        PROC_NAME         NVARCHAR(100)                   NULL,
        CONFIG_JSON       NVARCHAR(MAX)                   NOT NULL,
        USE_YN            CHAR(1)                         NOT NULL   DEFAULT 'Y',
        REG_DT            DATETIME                        NOT NULL   DEFAULT GETDATE(),
        UPD_DT            DATETIME                        NULL,
        CREATION_DATE     VARCHAR(14)                     NULL,
        CREATED_BY        VARCHAR(30)                     NULL,
        LAST_UPDATE_DATE  VARCHAR(14)                     NULL,
        LAST_UPDATED_BY   VARCHAR(30)                     NULL,
        CONSTRAINT PK_APVMNG_PROCESS PRIMARY KEY (PROC_ID),
        CONSTRAINT UQ_APVMNG_PROCESS_MENU UNIQUE (MENU_ID)
    )
END
GO

-- 승인 요청 (실제 승인 요청 건)
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_REQUEST' AND xtype = 'U')
BEGIN
    CREATE TABLE TB_MOBILE_APVMNG_REQUEST (
        REQ_ID            INT             IDENTITY(1,1)   NOT NULL,
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
        SA_ID             INT             IDENTITY(1,1)   NOT NULL,
        REQ_ID            INT                             NOT NULL,
        STEP_NO           INT                             NOT NULL,
        APV_TYPE          NVARCHAR(20)                    NOT NULL,  -- INDIVIDUAL / GROUP / DEPT_HEAD
        EMP_CODE          NVARCHAR(50)                    NOT NULL,
        THRESHOLD         INT                             NOT NULL   DEFAULT 1,
        CREATION_DATE     VARCHAR(14)                     NULL,
        CREATED_BY        VARCHAR(30)                     NULL,
        LAST_UPDATE_DATE  VARCHAR(14)                     NULL,
        LAST_UPDATED_BY   VARCHAR(30)                     NULL,
        CONSTRAINT PK_APVMNG_STEP_APV PRIMARY KEY (SA_ID),
        CONSTRAINT FK_APVMNG_SA_REQ FOREIGN KEY (REQ_ID) REFERENCES TB_MOBILE_APVMNG_REQUEST(REQ_ID)
    )
END
GO

-- 승인 처리 이력
IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_ACTION' AND xtype = 'U')
BEGIN
    CREATE TABLE TB_MOBILE_APVMNG_ACTION (
        ACT_ID            INT             IDENTITY(1,1)   NOT NULL,
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
        CONSTRAINT PK_APVMNG_ACTION PRIMARY KEY (ACT_ID),
        CONSTRAINT FK_APVMNG_ACT_REQ FOREIGN KEY (REQ_ID) REFERENCES TB_MOBILE_APVMNG_REQUEST(REQ_ID)
    )
END
GO

-- ─── 2. 프로시저 ─────────────────────────────────────────────

-- 절차 설정 조회
IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_process_get' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_process_get
GO
CREATE PROCEDURE usp_mobile_apvmng_process_get
    @MENU_ID    NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON

    IF EXISTS (SELECT 1 FROM TB_MOBILE_APVMNG_PROCESS WHERE MENU_ID = @MENU_ID AND USE_YN = 'Y')
    BEGIN
        SELECT
            '0'         AS Flag,
            ''          AS MSG,
            PROC_ID,
            MENU_ID,
            PROC_NAME,
            CONFIG_JSON,
            REG_DT,
            UPD_DT
        FROM TB_MOBILE_APVMNG_PROCESS
        WHERE MENU_ID = @MENU_ID AND USE_YN = 'Y'
    END
    ELSE
    BEGIN
        SELECT '1' AS Flag, '설정된 절차가 없습니다.' AS MSG
    END
END
GO

-- 절차 설정 저장 (없으면 INSERT, 있으면 UPDATE)
IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_process_save' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_process_save
GO
CREATE PROCEDURE usp_mobile_apvmng_process_save
    @MENU_ID        NVARCHAR(50),
    @PROC_NAME      NVARCHAR(100),
    @CONFIG_JSON    NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON

    BEGIN TRY
        IF EXISTS (SELECT 1 FROM TB_MOBILE_APVMNG_PROCESS WHERE MENU_ID = @MENU_ID)
        BEGIN
            UPDATE TB_MOBILE_APVMNG_PROCESS
            SET PROC_NAME   = @PROC_NAME,
                CONFIG_JSON = @CONFIG_JSON,
                UPD_DT      = GETDATE()
            WHERE MENU_ID = @MENU_ID
        END
        ELSE
        BEGIN
            INSERT INTO TB_MOBILE_APVMNG_PROCESS (MENU_ID, PROC_NAME, CONFIG_JSON, USE_YN, REG_DT)
            VALUES (@MENU_ID, @PROC_NAME, @CONFIG_JSON, 'Y', GETDATE())
        END

        SELECT '0' AS Flag, '저장되었습니다.' AS MSG
    END TRY
    BEGIN CATCH
        SELECT '1' AS Flag, ERROR_MESSAGE() AS MSG
    END CATCH
END
GO

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

        INSERT INTO TB_MOBILE_APVMNG_REQUEST
            (MENU_ID, REQ_EMP_CODE, REQ_EMP_NAME, PAYLOAD_JSON, PROC_SNAPSHOT,
             TOTAL_STEPS, CURRENT_STEP, STATUS, REG_DT)
        VALUES
            (@MENU_ID, @REQ_EMP_CODE, @REQ_EMP_NAME, @PAYLOAD_JSON, @PROC_SNAPSHOT,
             @TOTAL_STEPS, 1, 'PENDING', GETDATE())

        SET @REQ_ID = SCOPE_IDENTITY()

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
        INSERT INTO TB_MOBILE_APVMNG_STEP_APV (REQ_ID, STEP_NO, APV_TYPE, EMP_CODE, THRESHOLD)
        VALUES (@REQ_ID, @STEP_NO, @APV_TYPE, @EMP_CODE, @THRESHOLD)

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

-- 승인 / 반려 처리
IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_action' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_action
GO
CREATE PROCEDURE usp_mobile_apvmng_action
    @REQ_ID     INT,
    @APV_CODE   NVARCHAR(50),
    @APV_NAME   NVARCHAR(100),
    @ACTION     NVARCHAR(20),   -- APPROVE / REJECT
    @COMMENT    NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON

    BEGIN TRY
        DECLARE @CURRENT_STEP   INT
        DECLARE @TOTAL_STEPS    INT
        DECLARE @STATUS         NVARCHAR(20)
        DECLARE @THRESHOLD      INT
        DECLARE @APPROVE_CNT    INT
        DECLARE @NEXT_STATUS    NVARCHAR(20)

        SELECT
            @CURRENT_STEP = CURRENT_STEP,
            @TOTAL_STEPS  = TOTAL_STEPS,
            @STATUS       = STATUS
        FROM TB_MOBILE_APVMNG_REQUEST
        WHERE REQ_ID = @REQ_ID

        -- 이미 종료된 요청이면 오류
        IF @STATUS <> 'PENDING'
        BEGIN
            SELECT '1' AS Flag, '이미 처리된 요청입니다.' AS MSG, @STATUS AS NEW_STATUS
            RETURN
        END

        -- 이미 이 단계에서 처리한 경우 오류
        IF EXISTS (
            SELECT 1 FROM TB_MOBILE_APVMNG_ACTION
            WHERE REQ_ID = @REQ_ID AND STEP_NO = @CURRENT_STEP AND APV_CODE = @APV_CODE
        )
        BEGIN
            SELECT '1' AS Flag, '이미 처리하셨습니다.' AS MSG, @STATUS AS NEW_STATUS
            RETURN
        END

        -- 이력 저장
        INSERT INTO TB_MOBILE_APVMNG_ACTION (REQ_ID, STEP_NO, APV_CODE, APV_NAME, ACTION, COMMENT, ACT_DT)
        VALUES (@REQ_ID, @CURRENT_STEP, @APV_CODE, @APV_NAME, @ACTION, @COMMENT, GETDATE())

        -- 반려이면 바로 종료
        IF @ACTION = 'REJECT'
        BEGIN
            UPDATE TB_MOBILE_APVMNG_REQUEST
            SET STATUS = 'REJECTED', UPD_DT = GETDATE()
            WHERE REQ_ID = @REQ_ID

            SELECT '0' AS Flag, '반려 처리되었습니다.' AS MSG, 'REJECTED' AS NEW_STATUS, 0 AS NEXT_STEP_NO
            RETURN
        END

        -- 승인: 이 단계 threshold 확인
        SELECT @THRESHOLD = ISNULL(MAX(THRESHOLD), 1)
        FROM TB_MOBILE_APVMNG_STEP_APV
        WHERE REQ_ID = @REQ_ID AND STEP_NO = @CURRENT_STEP

        SELECT @APPROVE_CNT = COUNT(DISTINCT APV_CODE)
        FROM TB_MOBILE_APVMNG_ACTION
        WHERE REQ_ID = @REQ_ID AND STEP_NO = @CURRENT_STEP AND ACTION = 'APPROVE'

        -- threshold 미달: 아직 대기
        IF @APPROVE_CNT < @THRESHOLD
        BEGIN
            SELECT '0' AS Flag, '승인되었습니다. 추가 승인 대기 중입니다.' AS MSG, 'PENDING' AS NEW_STATUS, 0 AS NEXT_STEP_NO
            RETURN
        END

        -- threshold 달성: 다음 단계로
        IF @CURRENT_STEP < @TOTAL_STEPS
        BEGIN
            UPDATE TB_MOBILE_APVMNG_REQUEST
            SET CURRENT_STEP = @CURRENT_STEP + 1, UPD_DT = GETDATE()
            WHERE REQ_ID = @REQ_ID

            SELECT '0' AS Flag, '승인되었습니다. 다음 단계로 이동합니다.' AS MSG, 'PENDING' AS NEW_STATUS, @CURRENT_STEP + 1 AS NEXT_STEP_NO
        END
        ELSE
        BEGIN
            -- 마지막 단계 승인 완료
            UPDATE TB_MOBILE_APVMNG_REQUEST
            SET STATUS = 'APPROVED', UPD_DT = GETDATE()
            WHERE REQ_ID = @REQ_ID

            SELECT '0' AS Flag, '최종 승인이 완료되었습니다.' AS MSG, 'APPROVED' AS NEW_STATUS, 0 AS NEXT_STEP_NO
        END

    END TRY
    BEGIN CATCH
        SELECT '1' AS Flag, ERROR_MESSAGE() AS MSG, '' AS NEW_STATUS, 0 AS NEXT_STEP_NO
    END CATCH
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

    SELECT TOP 200
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

-- ─── 끝 ──────────────────────────────────────────────────────
