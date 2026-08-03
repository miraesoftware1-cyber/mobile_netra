# 전체 일정 캘린더 (SCH_02)

## 개요

- **경로**: `src/app/(main)/SCH/SCH_02/page.tsx` (로직 인라인)
- **접근 권한**: 전체 사용자
- 전 직원의 일정과 승인된 휴가를 월 캘린더로 조회한다. 내 일정/전체 토글 및 타입 필터를 지원한다.

## 구현 방식

- `myOnly: boolean` — true이면 현재 사용자의 `emp_code`로 캘린더 점·이벤트 목록 모두 필터링.
- `filter: "all" | "휴가" | "일정"` — 타입 필터. "all"은 UI에서 "휴가·일정"으로 표시.
- `selectedDate: string | null` — 날짜 클릭 시 해당 날짜 이벤트만 표시. 재클릭 시 해제.
- `expandToDayKeys`: 날짜 범위를 개별 날짜 키로 확장 → `scheduleDayMap` / `leaveDayMap` 구성 (다중일 이벤트에도 점 표시).
- 휴가 데이터는 연간 전체를 받아 클라이언트에서 현재 월로 필터링.
- `filteredItems`: type·myOnly·selectedDate 세 조건을 `useMemo` 체인으로 적용.

## 작동 흐름

1. 진입/월 이동 시 해당 월 일정(`usp_mobile_get_cal_scd`)과 연간 휴가(`usp_mobile_get_all_holiday_list`) 조회
2. 캘린더: 일정 있는 날 초록 점, 휴가 있는 날 인디고 점
3. 날짜 클릭 → 해당 날 이벤트 목록 필터링 (재클릭 해제)
4. "내 일정/전체 일정" 토글, "휴가·일정/휴가/일정" 필터 적용

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/schedule` | `usp_mobile_get_cal_scd` | param1=yearMonth(YYYYMM) |
| `GET /api/leave/all-holiday-list` | `usp_mobile_get_all_holiday_list` | param1=corp_code, param2=year |

### 주요 데이터 흐름

| 데이터 | 출처 | 사용처 |
|--------|------|--------|
| 전 직원 일정 | `usp_mobile_get_cal_scd` | 초록 점, 이벤트 카드 (초록 테마) |
| 연간 휴가 | `usp_mobile_get_all_holiday_list` | 인디고 점, 이벤트 카드 (인디고 테마) |

### UI 토글 색상

| 상태 | 색상 |
|------|------|
| 전체 일정 (myOnly=false) | 황색(amber) 배경 |
| 내 일정 (myOnly=true) | 하늘색(sky blue) 배경 |

### 주의사항

- 이벤트 목록에서 `year_bdate`가 현재 월로 시작하지 않는 다중월 휴가는 표시 안 됨 (캘린더 점은 표시됨).
