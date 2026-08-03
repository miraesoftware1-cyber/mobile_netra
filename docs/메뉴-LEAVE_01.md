# 연차 신청 (LEAVE_01)

## 개요

- **경로**: `src/app/(main)/LEAVE/LEAVE_01/page.tsx` → `features/leave/components/leave-request-form.tsx`
- **접근 권한**: 전체 사용자 (mobile_flag=Y 또는 user_type=S)
- 휴가 종류를 선택하고 날짜 범위를 지정해 연차/반차/공가 등을 신청한다.
- 사용 연차 일수는 시작일~종료일 사이 영업일(주말·공휴일 제외)에 휴가 종류의 `subtract_val`을 곱해 자동 계산된다.

## 구현 방식

- 폼 상태: `react-hook-form` + zod. 필드: `leaveTypeCode`, `startDate`, `endDate`, `reason`, `note`.
- 시작일 선택 후 종료일이 비어있으면 종료일을 같은 날로 자동 설정.
- `subtract_flag === 'N'`인 타입(공가 등)은 잔여 연차 차감 없이 `usedDays = 0` 고정.
- 잔여 연차(`year_reday`) 초과 시 경고 다이얼로그 표시 후 사용자 확인 시 제출 진행.
- 날짜 피커에서 공휴일은 빨간색으로 표시 (`holidayDates` Set으로 관리).

## 작동 흐름

1. 진입 시 휴가 종류 목록(`usp_mobile_get_holiday_type`), 잔여 연차(`usp_mobile_get_holiday_info`), 공휴일(`usp_mobile_get_holiday`) 동시 조회
2. 사용자가 휴가 종류·날짜 선택 → 사용 연차 자동 계산
3. 제출 → 잔여 초과 확인 → `usp_mobile_insert_holiday` 호출
4. 성공 다이얼로그 확인 → `/menu`로 이동

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/leave/holiday-info` | `usp_mobile_get_holiday_info` | param1=year, param2=emp_code |
| `GET /api/leave/holiday-type` | `usp_mobile_get_holiday_type` | — |
| `GET /api/leave/company-holidays` | `usp_mobile_get_holiday` | param1=corpCode, param2=year |
| `POST /api/leave/request` | `usp_mobile_insert_holiday` | param1=emp_code, param2=year, param3=leaveTypeCode, param4=appliedDate, param5=startDate, param6=endDate, param7=usedDays, param8=note, param9=reason, param10=phoneNumber |

### 주요 데이터 흐름

| 데이터 | 출처 | 사용처 |
|--------|------|--------|
| 휴가 종류 목록 | ERP `usp_mobile_get_holiday_type` | 종류 드롭다운, `subtract_val`·`subtract_flag` |
| 잔여 연차 | ERP `usp_mobile_get_holiday_info` | 초과 여부 경고 |
| 공휴일 목록 | ERP `usp_mobile_get_holiday` | 영업일 계산 제외, 달력 빨간색 표시 |
