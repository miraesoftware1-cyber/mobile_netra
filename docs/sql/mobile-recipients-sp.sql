-- ============================================================
-- 모바일 알림 수신 대상자 조회 (MOBILE_E_001)
-- ============================================================
--   param1=사업장코드  param2=부서코드(빈값=전체)
--   param3=사원명(빈값=전체, LIKE 검색)  param4=재직상태(빈값=전체)
-- ============================================================

ALTER PROCEDURE [dbo].[usp_mobile_emp_query]
    @CORP_CODE   varchar(10),
    @DPT_CODE    varchar(10),   -- 부서코드 (빈값=전체)
    @EMP_NAME    varchar(50),   -- 사원명 (빈값=전체, LIKE)
    @EMP_STATUS  varchar(10)    -- 재직상태 (빈값=전체 / Y=재직)
AS
SET NOCOUNT ON;
BEGIN TRY
    SELECT
        '0'                             AS Flag,
        ''                              AS MSG,
        e.corp_code,
        c.corp_name,
        e.dpt_code,
        d.dpt_name,
        e.emp_code,
        e.emp_name,
        e.emp_position,
        ISNULL(pc.c_name, '')           AS emp_position_name,
        ISNULL(eu.mobile_flag, 'N')     AS mobile_flag,
        ISNULL(e.cel_no, '')            AS cel_no,
        e.emp_status,
        e.first_date
    FROM mst_emp e
    LEFT JOIN mst_corp c  ON c.corp_code = e.corp_code
    LEFT JOIN mst_dpt  d  ON d.corp_code = e.corp_code AND d.dpt_code = e.dpt_code
    LEFT JOIN env_user eu ON eu.corp_code = e.corp_code AND eu.emp_code = e.emp_code
    LEFT JOIN mst_code pc ON pc.c_id = 'EMP_POSITION' AND pc.use_flag = 'Y' AND pc.c_code = e.emp_position
    WHERE e.corp_code = @CORP_CODE
      AND (LTRIM(ISNULL(@DPT_CODE,   '')) = '' OR e.dpt_code   = @DPT_CODE)
      AND (LTRIM(ISNULL(@EMP_NAME,   '')) = '' OR e.emp_name LIKE '%' + LTRIM(RTRIM(@EMP_NAME)) + '%')
      AND (LTRIM(ISNULL(@EMP_STATUS, '')) = '' OR e.emp_status = @EMP_STATUS)
    ORDER BY e.dpt_code, e.emp_code
END TRY
BEGIN CATCH
    SELECT -1 AS Flag, ERROR_MESSAGE() AS MSG
END CATCH
