-- ============================================================
-- 연차사용 알림 조회 (MOBILE_B_005 / LEAVE_05)
-- ERP 등록용 — 최초 등록 시 CREATE, 이후 ALTER 로 변경
-- ============================================================

-- ─── 1. 연차 알림 조회 (LIST / DETAIL 통합) ─────────────────
--
-- LIST  : 직원 목록 + 연차 현황
--   param1=LIST  param2=년도  param3=사업장코드
--   param4=부서코드(빈값=전체)  param5=재직상태(빈값=전체)  param6=사번(빈값=전체)
--
-- DETAIL: 특정 직원 명세 목록 + 월별 상세 (팝업 진입 시)
--   param1=DETAIL  param2=년도  param3=사업장코드
--   param4=  param5=  param6=사번
-- ─────────────────────────────────────────────────────────────

ALTER PROCEDURE [dbo].[usp_mobile_leave_notify_query]
    @MODE        varchar(10),   -- 'LIST' | 'DETAIL'
    @YEAR        varchar(4),    -- 달력년도 (4자리)
    @CORP_CODE   varchar(10),   -- 사업장코드
    @DPT_CODE    varchar(10),   -- 부서코드 (빈값=전체)
    @EMP_STATUS  varchar(10),   -- 재직상태 (빈값=전체)
    @EMP_CODE    varchar(20),   -- 사번 (LIST: 빈값=전체 / DETAIL: 필수)
    @YEAR_STDATE varchar(8),    -- 기준일 yyyyMMdd (빈값=전체)
    @HURRY_DATE  varchar(8)     -- 촉진일 yyyyMMdd (빈값=전체)
AS
SET NOCOUNT ON;
BEGIN TRY

    IF @MODE = 'LIST'
    BEGIN
        SELECT
            '0'                                                             AS Flag,
            ''                                                              AS MSG,
            x.corp_code,
            x.corp_name,
            x.dpt_code,
            x.dpt_name,
            x.emp_position,
            x.emp_position_name,
            x.emp_code,
            x.emp_name,
            x.year_alday,
            x.year_emday,
            ISNULL(x.year_alday, 0) - ISNULL(x.year_emday, 0)             AS year_reday,
            x.emp_status,
            x.first_date,
            x.mobile_flag,
            (SELECT COUNT(1) FROM HRM_NW_PRT p2
             WHERE p2.corp_code = x.corp_code
               AND p2.emp_code  = x.emp_code
               AND p2.year_st   = @YEAR)                                   AS prt_count
        FROM (
            SELECT
                e.corp_code,
                c.corp_name,
                e.dpt_code,
                d.dpt_name,
                e.emp_position,
                ISNULL(pc.c_name, '')                                       AS emp_position_name,
                h.emp_code,
                e.emp_name,
                nw.year_alday,
                SUM(h.year_emday)                                           AS year_emday,
                e.emp_status,
                e.first_date,
                ISNULL(eu.mobile_flag, 'N')                                 AS mobile_flag
            FROM HRM_NW_YEARHIS h
            LEFT JOIN mst_emp  e  ON e.emp_code  = h.emp_code
            LEFT JOIN mst_corp c  ON c.corp_code = e.corp_code
            LEFT JOIN mst_dpt  d  ON d.corp_code = e.corp_code AND d.dpt_code = e.dpt_code
            LEFT JOIN hrm_nw_year nw ON nw.emp_code = h.emp_code AND nw.year_st = h.year_st
            LEFT JOIN env_user  eu ON eu.corp_code = e.corp_code AND eu.emp_code = h.emp_code
            LEFT JOIN mst_code  pc ON pc.c_id = 'EMP_POSITION' AND pc.use_flag = 'Y' AND pc.c_code = e.emp_position
            WHERE LEFT(h.year_bdate, 4) = @YEAR
              AND e.corp_code            = @CORP_CODE
              AND h.year_chk             = 'Y'
              AND (LTRIM(ISNULL(@DPT_CODE,   '')) = '' OR e.dpt_code   = @DPT_CODE)
              AND (LTRIM(ISNULL(@EMP_STATUS, '')) = '' OR e.emp_status = @EMP_STATUS)
              AND (LTRIM(ISNULL(@EMP_CODE,   '')) = '' OR h.emp_code   = @EMP_CODE)
            GROUP BY
                e.corp_code, c.corp_name, e.dpt_code, d.dpt_name,
                e.emp_position, pc.c_name, h.emp_code, e.emp_name,
                nw.year_alday, e.emp_status, e.first_date, eu.mobile_flag
        ) x
        ORDER BY x.dpt_code, x.emp_code
    END

    ELSE IF @MODE = 'DETAIL'
    BEGIN
        SELECT
            '0'             AS Flag,
            ''              AS MSG,
            p.emp_code,
            p.year_st,
            p.prt_no1,
            p.year_stdate,
            p.hurry_date,
            p.year_alday,
            p.year_emday,
            p.year_reday,
            p.send_yn,
            p.mobile_send_yn,
            p.prt_yn,
            p.m1_date,  p.m1_cnt,  p.m1_rmk,
            p.m2_date,  p.m2_cnt,  p.m2_rmk,
            p.m3_date,  p.m3_cnt,  p.m3_rmk,
            p.m4_date,  p.m4_cnt,  p.m4_rmk,
            p.m5_date,  p.m5_cnt,  p.m5_rmk,
            p.m6_date,  p.m6_cnt,  p.m6_rmk,
            p.m7_date,  p.m7_cnt,  p.m7_rmk,
            p.m8_date,  p.m8_cnt,  p.m8_rmk,
            p.m9_date,  p.m9_cnt,  p.m9_rmk,
            p.m10_date, p.m10_cnt, p.m10_rmk,
            p.m11_date, p.m11_cnt, p.m11_rmk,
            p.m12_date, p.m12_cnt, p.m12_rmk,
            p.remark
        FROM HRM_NW_PRT p
        WHERE p.corp_code = @CORP_CODE
          AND p.emp_code  = @EMP_CODE
          AND p.year_st   = @YEAR
          AND (LTRIM(ISNULL(@YEAR_STDATE, '')) = '' OR p.year_stdate = @YEAR_STDATE)
          AND (LTRIM(ISNULL(@HURRY_DATE,  '')) = '' OR p.hurry_date  = @HURRY_DATE)
        ORDER BY p.prt_no1
    END

    ELSE
        SELECT '1' AS Flag, '알 수 없는 모드입니다.' AS MSG

END TRY
BEGIN CATCH
    SELECT -1 AS Flag, ERROR_MESSAGE() AS MSG
END CATCH

-- ─── 2. 모바일 알림 전송 처리 ────────────────────────────────
--   mobile_send_yn = 'Y' 업데이트 후 알림 발송용 직원 정보 반환
--   param1=사업장코드  param2=사번  param3=년도  param4=출력순번  param5=처리자ID

ALTER PROCEDURE [dbo].[usp_mobile_leave_notify_send]
    @CORP_CODE  varchar(10),
    @EMP_CODE   varchar(20),
    @YEAR_ST    varchar(4),
    @PRT_NO1    int,
    @USER_ID    varchar(30)
AS
SET NOCOUNT ON;
BEGIN TRY

    UPDATE HRM_NW_PRT
    SET mobile_send_yn   = 'Y',
        last_update_date = dbo.SysDate(),
        last_updated_by  = @USER_ID
    WHERE corp_code = @CORP_CODE
      AND emp_code  = @EMP_CODE
      AND year_st   = @YEAR_ST
      AND prt_no1   = @PRT_NO1

    -- 푸시 발송에 필요한 정보 반환
    SELECT
        '0'             AS Flag,
        ''              AS MSG,
        e.emp_code,
        e.emp_name,
        p.year_reday,
        p.hurry_date
    FROM HRM_NW_PRT p
    INNER JOIN mst_emp e ON e.emp_code = p.emp_code
    WHERE p.corp_code = @CORP_CODE
      AND p.emp_code  = @EMP_CODE
      AND p.year_st   = @YEAR_ST
      AND p.prt_no1   = @PRT_NO1

END TRY
BEGIN CATCH
    SELECT -1 AS Flag, ERROR_MESSAGE() AS MSG,
           '' AS emp_code, '' AS emp_name, 0 AS year_reday, '' AS hurry_date
END CATCH

-- ─── 3. 명세 생성 ────────────────────────────────────────────
--   param1=사업장코드  param2=사번  param3=년도
--   param4=기준일(yyyyMMdd)  param5=촉진일(yyyyMMdd)  param6=처리자ID

ALTER PROCEDURE [dbo].[usp_mobile_leave_notify_create]
    @CORP_CODE      varchar(10),
    @EMP_CODE       varchar(20),
    @YEAR_ST        varchar(4),
    @YEAR_STDATE    varchar(8),    -- 기준일 (yyyyMMdd)
    @HURRY_DATE     varchar(8),    -- 촉진일 (yyyyMMdd)
    @USER_ID        varchar(30)
AS
SET NOCOUNT ON;
BEGIN TRY

    DECLARE @prt_no1        int
    DECLARE @dpt_code       varchar(10)
    DECLARE @emp_pos        varchar(10)
    DECLARE @year_alday     decimal(10, 1)
    DECLARE @year_emday     decimal(10, 1)
    DECLARE @YEAR_ST_ACTUAL varchar(4)

    -- 월별 사용 내역
    DECLARE @m1_date  varchar(8)  DECLARE @m1_cnt  decimal(10,1)
    DECLARE @m2_date  varchar(8)  DECLARE @m2_cnt  decimal(10,1)
    DECLARE @m3_date  varchar(8)  DECLARE @m3_cnt  decimal(10,1)
    DECLARE @m4_date  varchar(8)  DECLARE @m4_cnt  decimal(10,1)
    DECLARE @m5_date  varchar(8)  DECLARE @m5_cnt  decimal(10,1)
    DECLARE @m6_date  varchar(8)  DECLARE @m6_cnt  decimal(10,1)
    DECLARE @m7_date  varchar(8)  DECLARE @m7_cnt  decimal(10,1)
    DECLARE @m8_date  varchar(8)  DECLARE @m8_cnt  decimal(10,1)
    DECLARE @m9_date  varchar(8)  DECLARE @m9_cnt  decimal(10,1)
    DECLARE @m10_date varchar(8)  DECLARE @m10_cnt decimal(10,1)
    DECLARE @m11_date varchar(8)  DECLARE @m11_cnt decimal(10,1)
    DECLARE @m12_date varchar(8)  DECLARE @m12_cnt decimal(10,1)

    -- 달력년도(@YEAR_ST) → 실제 연차년도 변환
    SELECT TOP 1 @YEAR_ST_ACTUAL = h.year_st
    FROM HRM_NW_YEARHIS h
    WHERE h.emp_code = @EMP_CODE
      AND LEFT(h.year_bdate, 4) = @YEAR_ST
      AND h.year_chk = 'Y'
    ORDER BY h.year_st DESC

    IF @YEAR_ST_ACTUAL IS NULL SET @YEAR_ST_ACTUAL = @YEAR_ST

    -- 다음 prt_no1
    SELECT @prt_no1 = ISNULL(MAX(prt_no1), 0) + 1
    FROM HRM_NW_PRT
    WHERE corp_code = @CORP_CODE
      AND emp_code  = @EMP_CODE
      AND year_st   = @YEAR_ST_ACTUAL

    -- 직원 기본 정보
    SELECT @dpt_code = dpt_code, @emp_pos = emp_position
    FROM mst_emp
    WHERE emp_code = @EMP_CODE

    -- 연차 발생일수
    SELECT @year_alday = year_alday
    FROM hrm_nw_year
    WHERE emp_code = @EMP_CODE AND year_st = @YEAR_ST_ACTUAL

    -- 연차 사용일수 + 월별 집계 (해당 연차년도 전체)
    SELECT
        @year_emday = ISNULL(SUM(year_emday), 0),
        @m1_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='01' THEN year_bdate END),
        @m1_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='01' THEN year_emday ELSE 0 END), 0),
        @m2_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='02' THEN year_bdate END),
        @m2_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='02' THEN year_emday ELSE 0 END), 0),
        @m3_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='03' THEN year_bdate END),
        @m3_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='03' THEN year_emday ELSE 0 END), 0),
        @m4_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='04' THEN year_bdate END),
        @m4_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='04' THEN year_emday ELSE 0 END), 0),
        @m5_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='05' THEN year_bdate END),
        @m5_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='05' THEN year_emday ELSE 0 END), 0),
        @m6_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='06' THEN year_bdate END),
        @m6_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='06' THEN year_emday ELSE 0 END), 0),
        @m7_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='07' THEN year_bdate END),
        @m7_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='07' THEN year_emday ELSE 0 END), 0),
        @m8_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='08' THEN year_bdate END),
        @m8_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='08' THEN year_emday ELSE 0 END), 0),
        @m9_date  = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='09' THEN year_bdate END),
        @m9_cnt   = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='09' THEN year_emday ELSE 0 END), 0),
        @m10_date = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='10' THEN year_bdate END),
        @m10_cnt  = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='10' THEN year_emday ELSE 0 END), 0),
        @m11_date = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='11' THEN year_bdate END),
        @m11_cnt  = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='11' THEN year_emday ELSE 0 END), 0),
        @m12_date = MIN(CASE WHEN SUBSTRING(year_bdate,5,2)='12' THEN year_bdate END),
        @m12_cnt  = ISNULL(SUM(CASE WHEN SUBSTRING(year_bdate,5,2)='12' THEN year_emday ELSE 0 END), 0)
    FROM HRM_NW_YEARHIS
    WHERE emp_code = @EMP_CODE
      AND year_st  = @YEAR_ST_ACTUAL
      AND year_chk = 'Y'

    INSERT INTO HRM_NW_PRT (
        emp_code, year_st, prt_no1, corp_code, dpt_code, emp_position,
        year_stdate, year_alday, year_emday, year_reday,
        m1_date,   m1_cnt,   m2_date,   m2_cnt,   m3_date,   m3_cnt,
        m4_date,   m4_cnt,   m5_date,   m5_cnt,   m6_date,   m6_cnt,
        m7_date,   m7_cnt,   m8_date,   m8_cnt,   m9_date,   m9_cnt,
        m10_date,  m10_cnt,  m11_date,  m11_cnt,  m12_date,  m12_cnt,
        remark, prt_yn, hurry_date,
        creation_date, created_by, last_update_date, last_updated_by
    )
    VALUES (
        @EMP_CODE, @YEAR_ST_ACTUAL, @prt_no1, @CORP_CODE, @dpt_code, @emp_pos,
        @YEAR_STDATE,
        ISNULL(@year_alday, 0),
        ISNULL(@year_emday, 0),
        ISNULL(@year_alday, 0) - ISNULL(@year_emday, 0),
        @m1_date,  @m1_cnt,  @m2_date,  @m2_cnt,  @m3_date,  @m3_cnt,
        @m4_date,  @m4_cnt,  @m5_date,  @m5_cnt,  @m6_date,  @m6_cnt,
        @m7_date,  @m7_cnt,  @m8_date,  @m8_cnt,  @m9_date,  @m9_cnt,
        @m10_date, @m10_cnt, @m11_date, @m11_cnt, @m12_date, @m12_cnt,
        NULL, 'N', @HURRY_DATE,
        dbo.SysDate(), @USER_ID, dbo.SysDate(), @USER_ID
    )

    SELECT '0' AS Flag, '' AS MSG, @prt_no1 AS prt_no1

END TRY
BEGIN CATCH
    SELECT -1 AS Flag, ERROR_MESSAGE() AS MSG, 0 AS prt_no1
END CATCH

-- ─── 4. 명세 삭제 ────────────────────────────────────────────
--   param1=사업장코드  param2=사번  param3=년도  param4=출력순번

ALTER PROCEDURE [dbo].[usp_mobile_leave_notify_delete]
    @CORP_CODE  varchar(10),
    @EMP_CODE   varchar(20),
    @YEAR_ST    varchar(4),
    @PRT_NO1    int
AS
SET NOCOUNT ON;
BEGIN TRY

    DECLARE @prt_yn varchar(1)
    SELECT @prt_yn = prt_yn
    FROM HRM_NW_PRT
    WHERE corp_code = @CORP_CODE AND emp_code = @EMP_CODE
      AND year_st   = @YEAR_ST  AND prt_no1  = @PRT_NO1

    IF @prt_yn = 'Y'
    BEGIN
        SELECT '1' AS Flag, '출력한 명세는 삭제할 수 없습니다.' AS MSG
        RETURN
    END

    DELETE FROM HRM_NW_PRT
    WHERE corp_code = @CORP_CODE
      AND emp_code  = @EMP_CODE
      AND year_st   = @YEAR_ST
      AND prt_no1   = @PRT_NO1

    SELECT '0' AS Flag, '' AS MSG

END TRY
BEGIN CATCH
    SELECT -1 AS Flag, ERROR_MESSAGE() AS MSG
END CATCH

-- ─── 끝 ──────────────────────────────────────────────────────
