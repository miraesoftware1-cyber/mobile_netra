# 내 일정 관리 (SCH_01)

## 개요

- **경로**: `src/app/(main)/SCH/SCH_01/page.tsx` (로직 인라인)
- **접근 권한**: 전체 사용자 (페이지 권한 `perm.view/add/edit/del` 적용)
- 본인의 일정을 조회·추가·수정·삭제한다. DataGrid 기반 CRUD.

## 구현 방식

- DataGrid + 체크박스 다중 선택 삭제 / 단일 행 클릭으로 수정 대상 선택.
- `focusedKey`: 현재 선택된 행의 `scd_key` (`scd_month_scd_no1` 합성 키). 수정 버튼 활성화 조건.
- `selectedKeys: Set<string>`: 체크된 행들. 삭제 버튼 활성화 조건.
- `perm`: `usePagePermission("SCH_01")`으로 추가·수정·삭제 버튼 비활성화 제어.
- 조회 결과는 클라이언트에서 `beg_date` 오름차순 정렬.
- 삭제는 `for...of` 순차 처리 (병렬 아님).
- `scd_key`는 클라이언트 전용 합성 키 — ERP에 전송하지 않음.

## 작동 흐름

1. 조회기간 설정 후 "조회" → `usp_mobile_cal_scd` mode=S
2. 행 클릭 → `focusedKey` 설정 → 수정 버튼 활성화
3. 추가/수정 버튼 → 모달 오픈 (추가: 빈 폼 / 수정: 선택 행 데이터)
4. 모달 저장 → `usp_mobile_cal_scd` mode=I(추가) 또는 mode=U(수정) → 목록 갱신
5. 체크 후 삭제 → 확인 다이얼로그 → `usp_mobile_cal_scd` mode=D 순차 호출

## 연동 관계

단일 ERP 프로시저 `usp_mobile_cal_scd`를 mode 파라미터로 분기. API: `/api/schedule-crud`.

| HTTP 메서드 | mode | param2 구성 |
|------------|------|------------|
| GET | S | `empCode\|startDate\|endDate` |
| POST (추가) | I | `emp_code\|scd_name\|beg_date\|end_date\|scd_time\|scd_remark\|user_id` |
| PUT (수정) | U | `emp_code\|scd_month\|scd_no1\|scd_name\|beg_date\|end_date\|scd_time\|scd_remark\|user_id` |
| DELETE | D | `emp_code\|scd_month\|scd_no1` |

### 입력값 제한

| 필드 | 제한 |
|------|------|
| 일정명(`scd_name`) | 최대 50자 (유니코드 문자 수) |
| 비고(`scd_remark`) | 최대 250자 (유니코드 문자 수) |
| 시작시간(`scd_time`) | 선택 사항 |

## UI 컴포넌트 구현 상세

### HourPicker (시간 선택)

native `<select>`를 제거하고 커스텀 팝오버 그리드 방식으로 교체되었습니다.

- **표시 방식**: 버튼 클릭 시 팝오버 열림 → 1열 세로 스크롤 그리드로 시간 목록 표시
- **AM/PM 탭**: AM(00~11시) / PM(12~23시) 탭으로 구분
- **폰트**: 고정 px 폰트 적용 (OS 폰트 크기 설정 영향 없음)
- **컨테이너 높이**: `min-h-[44px]` (OS 폰트 크기 변경 시에도 레이아웃 유지)
- **미선택 상태**: "시간 선택" 플레이스홀더 표시

### SchDatePickerField (날짜 선택)

- **overflow 처리**: `overflow-hidden` 적용으로 날짜 피커 영역 밖으로 내용 넘침 방지
- **폰트**: 고정 px 폰트 적용 (OS 폰트 크기 설정 영향 없음)
- **아이콘 여백**: 캘린더 아이콘 좌우 여백 조정
