-- ============================================================
-- MyBuilder 워크플로우 관리 - 테이블 및 프로시저
-- SQL Server 2008 이상 호환
-- ============================================================

-- ─── 0. 기존 테이블 수정 (최초 1회 실행) ─────────────────────

-- PROCESS 테이블에서 MENU_ID UNIQUE 제약 해제 (워크플로우가 여러 메뉴에 재사용 가능하도록)
IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'UQ_APVMNG_PROCESS_MENU' AND type = 'UQ')
    ALTER TABLE TB_MOBILE_APVMNG_PROCESS DROP CONSTRAINT UQ_APVMNG_PROCESS_MENU
GO

-- MENU_ID 컬럼 삭제 (메뉴 연결은 TB_MOBILE_APVMNG_MENU_MAP으로 분리)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TB_MOBILE_APVMNG_PROCESS') AND name = 'MENU_ID')
    ALTER TABLE TB_MOBILE_APVMNG_PROCESS DROP COLUMN MENU_ID
GO

-- ─── 1. 워크플로우 단계 테이블 (신규) ────────────────────────

IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_PROCESS_STEP' AND xtype = 'U')
create table TB_MOBILE_APVMNG_PROCESS_STEP (
    step_id          INT          not null,               -- 단계ID
    proc_id          INT          not null,               -- 프로세스ID
    step_no          INT          not null,               -- 단계번호
    step_type        VARCHAR(20)  not null,               -- 단계유형 (individual/group/dept_head)
    apv_code         VARCHAR(50)  null,                   -- 승인자코드
    apv_name         VARCHAR(100) null,                   -- 승인자명
    threshold        INT          default 1 not null,     -- 최소승인수
    push_yn          CHAR(1)      default 'Y' not null,   -- 푸시알림
    allow_final_yn   CHAR(1)      default 'N' not null,   -- 전결허용
    msg_title        VARCHAR(200) null,                   -- 메시지제목
    msg_body         VARCHAR(500) null,                   -- 메시지내용
    creation_date    VARCHAR(14)  null,                   -- 최초입력일
    created_by       VARCHAR(30)  null,                   -- 최초입력자
    last_update_date VARCHAR(14)  null,                   -- 최종입력일
    last_updated_by  VARCHAR(30)  null,                   -- 최종입력자
    PRIMARY key(step_id)
) ;
GO

-- ─── 2. 메뉴-워크플로우 연결 테이블 (신규) ───────────────────

IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name = 'TB_MOBILE_APVMNG_MENU_MAP' AND xtype = 'U')
create table TB_MOBILE_APVMNG_MENU_MAP (
    map_id           INT          not null,               -- 연결ID
    menu_id          VARCHAR(50)  not null,               -- 메뉴ID
    menu_name        VARCHAR(100) null,                   -- 메뉴명
    proc_id          INT          not null,               -- 프로세스ID
    use_yn           CHAR(1)      default 'Y' not null,   -- 사용여부
    creation_date    VARCHAR(14)  null,                   -- 최초입력일
    created_by       VARCHAR(30)  null,                   -- 최초입력자
    last_update_date VARCHAR(14)  null,                   -- 최종입력일
    last_updated_by  VARCHAR(30)  null,                   -- 최종입력자
    PRIMARY key(map_id)
) ;
GO

-- ─── 3. 앱 조회 SP 업데이트 ──────────────────────────────────
-- 앱에서 MENU_ID로 호출 → MENU_MAP → PROCESS_STEP 반환

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_process_get' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_process_get
GO
CREATE PROCEDURE usp_mobile_apvmng_process_get
    @MENU_ID NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON

    IF EXISTS (
        SELECT 1 FROM TB_MOBILE_APVMNG_MENU_MAP m
        INNER JOIN TB_MOBILE_APVMNG_PROCESS p ON p.PROC_ID = m.PROC_ID
        WHERE m.MENU_ID = @MENU_ID AND m.USE_YN = 'Y' AND p.USE_YN = 'Y'
    )
    BEGIN
        SELECT
            '0'                          AS Flag,
            ''                           AS MSG,
            p.PROC_ID,
            p.PROC_NAME,
            s.STEP_ID,
            s.STEP_NO,
            s.STEP_TYPE,
            ISNULL(s.APV_CODE,  '') AS APV_CODE,
            ISNULL(s.APV_NAME,  '') AS APV_NAME,
            s.THRESHOLD,
            s.PUSH_YN,
            s.ALLOW_FINAL_YN,
            ISNULL(s.MSG_TITLE, '') AS MSG_TITLE,
            ISNULL(s.MSG_BODY,  '') AS MSG_BODY
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
END
GO

-- ─── 4. MyBuilder 그리드 1: 워크플로우 목록 ──────────────────

-- ON(QUERY)
-- select proc_id,
--        isnull(proc_name, '') as proc_name,
--        use_yn
-- from TB_MOBILE_APVMNG_PROCESS
-- where use_yn = 'Y'
-- order by proc_id

-- ON(INSERT)
-- insert into TB_MOBILE_APVMNG_PROCESS (proc_id, proc_name, config_json, use_yn, creation_date, created_by)
-- values (coalesce((select max(proc_id) from TB_MOBILE_APVMNG_PROCESS), 0) + 1,
--         :grd_mst.proc_name, '{}', :grd_mst.use_yn, dbo.SysDate(), 'admin')

-- ON(UPDATE)
-- update TB_MOBILE_APVMNG_PROCESS
-- set proc_name = :grd_mst.proc_name,
--     use_yn    = :grd_mst.use_yn
-- where proc_id = #grd_mst.proc_id

-- ON(DELETE)
-- delete from TB_MOBILE_APVMNG_PROCESS_STEP where proc_id = #grd_mst.proc_id;
-- delete from TB_MOBILE_APVMNG_PROCESS where proc_id = #grd_mst.proc_id

-- ─── 5. MyBuilder 그리드 2: 단계 목록 ────────────────────────

-- ON(QUERY)
-- select step_id,
--        proc_id,
--        step_no,
--        step_type,
--        isnull(apv_code, '') as apv_code,
--        isnull(apv_name, '') as apv_name,
--        threshold,
--        push_yn,
--        allow_final_yn
-- from TB_MOBILE_APVMNG_PROCESS_STEP
-- where proc_id = #grd_mst.proc_id
-- order by step_no

-- ON(INSERT)
-- insert into TB_MOBILE_APVMNG_PROCESS_STEP
--     (step_id, proc_id, step_no, step_type, apv_code, apv_name, threshold, push_yn, allow_final_yn)
-- values
--     (coalesce((select max(step_id) from TB_MOBILE_APVMNG_PROCESS_STEP), 0) + 1,
--      #grd_mst.proc_id, :grd_itm.step_no, :grd_itm.step_type,
--      :grd_itm.apv_code, :grd_itm.apv_name,
--      :grd_itm.threshold, :grd_itm.push_yn, :grd_itm.allow_final_yn)

-- ON(UPDATE)
-- update TB_MOBILE_APVMNG_PROCESS_STEP
-- set step_no        = :grd_itm.step_no,
--     step_type      = :grd_itm.step_type,
--     apv_code       = :grd_itm.apv_code,
--     apv_name       = :grd_itm.apv_name,
--     threshold      = :grd_itm.threshold,
--     push_yn        = :grd_itm.push_yn,
--     allow_final_yn = :grd_itm.allow_final_yn
-- where step_id = #grd_itm.step_id

-- ON(DELETE)
-- delete from TB_MOBILE_APVMNG_PROCESS_STEP where step_id = #grd_itm.step_id

-- ─── 6. MyBuilder 그리드 3: 메시지 (폼) ──────────────────────

-- ON(QUERY)
-- select msg_title, msg_body
-- from TB_MOBILE_APVMNG_PROCESS_STEP
-- where step_id = #grd_itm.step_id

-- ON(UPDATE)
-- update TB_MOBILE_APVMNG_PROCESS_STEP
-- set msg_title = :grd_msg.msg_title,
--     msg_body  = :grd_msg.msg_body
-- where step_id = #grd_itm.step_id

-- ─── 7. MyBuilder 메뉴 연결 그리드 ───────────────────────────

-- ON(QUERY)
-- select map_id, menu_id, isnull(menu_name,'') as menu_name, proc_id, use_yn
-- from TB_MOBILE_APVMNG_MENU_MAP
-- order by menu_id

-- ON(INSERT)
-- insert into TB_MOBILE_APVMNG_MENU_MAP (map_id, menu_id, menu_name, proc_id, use_yn)
-- values (coalesce((select max(map_id) from TB_MOBILE_APVMNG_MENU_MAP), 0) + 1,
--         :grd_map.menu_id, :grd_map.menu_name, :grd_map.proc_id, :grd_map.use_yn)

-- ON(UPDATE)
-- update TB_MOBILE_APVMNG_MENU_MAP
-- set menu_id   = :grd_map.menu_id,
--     menu_name = :grd_map.menu_name,
--     proc_id   = :grd_map.proc_id,
--     use_yn    = :grd_map.use_yn
-- where map_id = #grd_map.map_id

-- ON(DELETE)
-- delete from TB_MOBILE_APVMNG_MENU_MAP where map_id = #grd_map.map_id

-- ─── 8. 그룹 멤버 조회 SP ────────────────────────────────────
-- 그룹 단계 승인자 resolve: APV_CODE(USER_GROUP명) → ENV_USER.USER_ID 목록
-- 앱에서 group step 처리 시 호출 (usp_mobile_apvmng_group_members)

IF EXISTS (SELECT 1 FROM sysobjects WHERE name = 'usp_mobile_apvmng_group_members' AND xtype = 'P')
    DROP PROCEDURE usp_mobile_apvmng_group_members
GO
CREATE PROCEDURE usp_mobile_apvmng_group_members
    @GROUP_CODE NVARCHAR(100)   -- ENV_USER.USER_GROUP 값 (예: _신입사원)
AS
BEGIN
    SET NOCOUNT ON
    SELECT '0'      AS Flag,
           ''       AS MSG,
           USER_ID  AS EMP_CODE,
           USER_NAME
    FROM ENV_USER
    WHERE USER_GROUP = @GROUP_CODE
      AND USER_TYPE  = 'U'
    ORDER BY USER_ID
END
GO

-- ─── 끝 ──────────────────────────────────────────────────────
