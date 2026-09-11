-- ============================================================
-- 승인 절차 관리 - 저장 프로시저 (ERP 등록용 ALTER 형식)
-- ============================================================

-- ─── 1. 워크플로우 조회 (앱에서 메뉴ID로 단계 조회) ──────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_process_get]
    @MENU_ID varchar(50)
AS
set nocount on;

BEGIN TRY
    IF EXISTS (
        SELECT 1 FROM TB_MOBILE_APVMNG_MENU_MAP m
        INNER JOIN TB_MOBILE_APVMNG_PROCESS p ON p.PROC_ID = m.PROC_ID
        WHERE m.MENU_ID = @MENU_ID AND m.USE_YN = 'Y' AND p.USE_YN = 'Y'
    )
    BEGIN
        SELECT
            '0'                         AS Flag,
            ''                          AS MSG,
            p.PROC_ID,
            p.PROC_NAME,
            s.STEP_ID,
            s.STEP_NO,
            s.STEP_TYPE,
            ISNULL(s.APV_CODE,  '')     AS APV_CODE,
            ISNULL(s.APV_NAME,  '')     AS APV_NAME,
            s.THRESHOLD,
            s.PUSH_YN,
            s.ALLOW_FINAL_YN,
            ISNULL(s.MSG_TITLE, '')     AS MSG_TITLE,
            ISNULL(s.MSG_BODY,  '')     AS MSG_BODY
        FROM TB_MOBILE_APVMNG_PROCESS_STEP s
        INNER JOIN TB_MOBILE_APVMNG_MENU_MAP m ON m.PROC_ID = s.PROC_ID
        INNER JOIN TB_MOBILE_APVMNG_PROCESS  p ON p.PROC_ID = s.PROC_ID
        WHERE m.MENU_ID = @MENU_ID AND m.USE_YN = 'Y' AND p.USE_YN = 'Y'
        ORDER BY s.STEP_NO
    END
    ELSE
    BEGIN
        SELECT '1' AS Flag, '설정된 절차가 없습니다.' AS MSG
    END
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 2. 승인 요청 생성 ───────────────────────────────────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_request_create]
    @MENU_ID        varchar(50),
    @REQ_EMP_CODE   varchar(50),
    @REQ_EMP_NAME   varchar(100),
    @PAYLOAD_JSON   varchar(max),
    @PROC_SNAPSHOT  varchar(max),
    @TOTAL_STEPS    int
AS
set nocount on;

BEGIN TRY
    DECLARE @REQ_ID int
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
    select -1 as Flag, ERROR_MESSAGE() as MSG, 0 as REQ_ID;
END CATCH
GO

-- ─── 3. 단계별 승인자 등록 ───────────────────────────────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_step_apv_add]
    @REQ_ID     int,
    @STEP_NO    int,
    @APV_TYPE   varchar(20),
    @EMP_CODE   varchar(50),
    @THRESHOLD  int
AS
set nocount on;

BEGIN TRY
    INSERT INTO TB_MOBILE_APVMNG_STEP_APV (SA_ID, REQ_ID, STEP_NO, APV_TYPE, EMP_CODE, THRESHOLD)
    VALUES (COALESCE((SELECT MAX(SA_ID) FROM TB_MOBILE_APVMNG_STEP_APV), 0) + 1,
            @REQ_ID, @STEP_NO, @APV_TYPE, @EMP_CODE, @THRESHOLD)

    SELECT '0' AS Flag, '' AS MSG
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 4. 승인 대기 목록 ───────────────────────────────────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_request_list]
    @EMP_CODE   varchar(50),
    @STATUS     varchar(20)     -- PENDING / APPROVED / REJECTED / ALL
AS
set nocount on;

BEGIN TRY
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
        CASE
            WHEN EXISTS (
                SELECT 1 FROM TB_MOBILE_APVMNG_ACTION
                WHERE REQ_ID = R.REQ_ID
                  AND STEP_NO = R.CURRENT_STEP
                  AND APV_CODE = @EMP_CODE
            ) THEN 'Y'
            ELSE 'N'
        END             AS ALREADY_ACTED,
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
    WHERE (@STATUS = 'ALL' OR R.STATUS = @STATUS)
    ORDER BY R.REG_DT DESC
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 5. 승인 요청 상세 ───────────────────────────────────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_request_detail]
    @REQ_ID int
AS
set nocount on;

BEGIN TRY
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

    SELECT
        ACT_ID, REQ_ID, STEP_NO, APV_CODE, APV_NAME, ACTION, COMMENT, ACT_DT
    FROM TB_MOBILE_APVMNG_ACTION
    WHERE REQ_ID = @REQ_ID
    ORDER BY ACT_DT
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 6. 단계별 승인자 조회 ───────────────────────────────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_step_approvers]
    @REQ_ID  int,
    @STEP_NO int
AS
set nocount on;

BEGIN TRY
    SELECT EMP_CODE
    FROM TB_MOBILE_APVMNG_STEP_APV WITH(NOLOCK)
    WHERE REQ_ID = @REQ_ID AND STEP_NO = @STEP_NO
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 7. 요청자 정보 조회 (알림용) ────────────────────────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_req_info]
    @REQ_ID int
AS
set nocount on;

BEGIN TRY
    SELECT REQ_EMP_CODE, MENU_ID, REQ_EMP_NAME, PAYLOAD_JSON
    FROM TB_MOBILE_APVMNG_REQUEST WITH(NOLOCK)
    WHERE REQ_ID = @REQ_ID
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 8. 단계 상태 조회 ───────────────────────────────────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_step_state]
    @REQ_ID  int,
    @USER_ID varchar(50)
AS
set nocount on;

BEGIN TRY
    SELECT
        '0'                         AS Flag,
        ''                          AS MSG,
        R.CURRENT_STEP,
        R.TOTAL_STEPS,
        R.STATUS,
        ISNULL(SA.THRESHOLD, 1)     AS THRESHOLD
    FROM TB_MOBILE_APVMNG_REQUEST R WITH(NOLOCK)
    LEFT JOIN TB_MOBILE_APVMNG_STEP_APV SA WITH(NOLOCK)
        ON SA.REQ_ID   = R.REQ_ID
        AND SA.STEP_NO = R.CURRENT_STEP
        AND SA.EMP_CODE = @USER_ID
    WHERE R.REQ_ID = @REQ_ID
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 9. 단계 상태 업데이트 ───────────────────────────────────

alter PROCEDURE [dbo].[usp_mobile_apvmng_set_step]
    @REQ_ID  int,
    @STATUS  varchar(20),   -- APPROVED / REJECTED / PENDING
    @STEP_NO int
AS
set nocount on;

BEGIN TRY
    IF @STATUS = 'PENDING'
        UPDATE TB_MOBILE_APVMNG_REQUEST
        SET CURRENT_STEP = @STEP_NO,
            UPD_DT       = GETDATE()
        WHERE REQ_ID = @REQ_ID
    ELSE
        UPDATE TB_MOBILE_APVMNG_REQUEST
        SET STATUS = @STATUS,
            UPD_DT = GETDATE()
        WHERE REQ_ID = @REQ_ID

    SELECT '0' AS Flag, '' AS MSG
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 10. 직원 조회 (전체 / 키워드 검색 통합) ────────────────
-- @KEYWORD 비면 전체 목록(TOP 1000), 있으면 검색(TOP 50)

alter PROCEDURE [dbo].[usp_mobile_apvmng_emp_lookup]
    @KEYWORD varchar(100) = ''
AS
set nocount on;

BEGIN TRY
    IF ISNULL(@KEYWORD, '') = ''
        SELECT TOP 1000
            e.emp_code              AS EMP_CODE,
            e.emp_name              AS EMP_NAME,
            ISNULL(d.dpt_name, '')  AS DPT_NAME
        FROM mst_emp e WITH(NOLOCK)
        LEFT JOIN mst_dpt d WITH(NOLOCK)
            ON d.corp_code = e.corp_code AND d.dpt_code = e.dpt_code
        WHERE ISNULL(e.ter_date, '') = ''
        ORDER BY e.emp_name
    ELSE
        SELECT TOP 50
            e.emp_code              AS EMP_CODE,
            e.emp_name              AS EMP_NAME,
            ISNULL(d.dpt_name, '')  AS DPT_NAME
        FROM mst_emp e WITH(NOLOCK)
        LEFT JOIN mst_dpt d WITH(NOLOCK)
            ON d.corp_code = e.corp_code AND d.dpt_code = e.dpt_code
        WHERE ISNULL(e.ter_date, '') = ''
          AND (
              e.emp_name LIKE '%' + @KEYWORD + '%'
              OR e.emp_code LIKE '%' + @KEYWORD + '%'
          )
        ORDER BY e.emp_name
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 11. 그룹 조회 (목록 / 멤버 통합) ───────────────────────
-- @TARGET 비면 그룹 목록(USER_TYPE='G'), 있으면 해당 그룹 멤버(USER_TYPE='U')

alter PROCEDURE [dbo].[usp_mobile_apvmng_group_lookup]
    @TARGET varchar(100) = ''   -- 비면 그룹목록, 있으면 GROUP_CODE
AS
set nocount on;

BEGIN TRY
    IF ISNULL(@TARGET, '') = ''
        SELECT
            USER_ID     AS EMP_CODE,
            USER_NAME   AS EMP_NAME,
            ''          AS DPT_NAME
        FROM ENV_USER WITH(NOLOCK)
        WHERE USER_TYPE = 'G'
        ORDER BY USER_ID
    ELSE
        SELECT
            USER_ID     AS EMP_CODE,
            USER_NAME   AS EMP_NAME,
            ''          AS DPT_NAME
        FROM ENV_USER WITH(NOLOCK)
        WHERE USER_GROUP = @TARGET
          AND USER_TYPE  = 'U'
        ORDER BY USER_ID
END TRY
BEGIN CATCH
    select -1 as Flag, ERROR_MESSAGE() as MSG;
END CATCH
GO

-- ─── 끝 ──────────────────────────────────────────────────────
