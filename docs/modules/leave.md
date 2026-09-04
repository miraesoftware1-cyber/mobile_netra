# 연차/휴가 모듈

## 개요

연차 신청, 조회, 승인, 부서 휴가 캘린더 기능을 제공합니다.  
부서장(`leader_flag`)만 접근 가능한 메뉴가 있습니다.

## 페이지

| 메뉴 ID | 경로 | 이름 | 권한 |
|---------|------|------|------|
| LEAVE_01 | `/LEAVE/LEAVE_01` | 휴가 신청 | 전체 |
| LEAVE_02 | `/LEAVE/LEAVE_02` | 휴가 조회 (부서) | 부서장 전용 |
| LEAVE_03 | `/LEAVE/LEAVE_03` | 휴가 신청 내역 | 전체 |
| LEAVE_04 | `/LEAVE/LEAVE_04` | 부서 휴가 캘린더 | 부서장 전용 |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/app/(main)/LEAVE/LEAVE_01/page.tsx` | 휴가 신청 폼 |
| `src/app/(main)/LEAVE/LEAVE_02/page.tsx` | 부서 휴가 조회 |
| `src/app/(main)/LEAVE/LEAVE_03/page.tsx` | 휴가 신청 내역 |
| `src/app/(main)/LEAVE/LEAVE_04/page.tsx` | 부서 휴가 캘린더 |
| `src/features/leave/api.ts` | 휴가 API 클라이언트 |
| `src/features/leave/hooks/use-holiday-types.ts` | 휴가 종류 조회 훅 |
| `src/features/leave/components/` | 휴가 UI 컴포넌트 |

## API 라우트

| 경로 | 메서드 | 프로시저 | 설명 |
|------|--------|----------|------|
| `/api/leave/holiday-list` | GET | `usp_mobile_get_holiday_list` | 내 휴가 목록 |
| `/api/leave/holiday-info` | GET | `usp_mobile_get_holiday_info` | 잔여 연차 정보 |
| `/api/leave/holiday-type` | GET | `usp_mobile_get_holiday_type` | 휴가 종류 목록 |
| `/api/leave/request` | POST | `usp_mobile_ins_holiday` | 휴가 신청 |
| `/api/leave/approval-list` | GET | `usp_mobile_get_approval_list` | 결재 대기 목록 |
| `/api/leave/approve` | POST | `usp_mobile_upd_approval` | 결재 승인/반려 |
| `/api/leave/department-holiday-list` | GET | `usp_mobile_get_dept_holiday_list` | 부서 휴가 목록 |
| `/api/leave/all-holiday-list` | GET | — | 전체 휴가 목록 |
| `/api/leave/company-holidays` | GET | — | 회사 공휴일 목록 |
| `/api/leave/company-holidays-by-corp` | GET | — | 법인별 공휴일 |

## 휴가 신청 시 승인 절차 연동

`/api/leave/request`는 ERP에 연차를 저장한 뒤 APVMNG 승인 절차 설정을 확인합니다.

- **절차 설정 있음 (`LEAVE_01`)**: `/api/approval/request`를 호출해 승인 요청을 생성하고 1단계 승인자에게 푸시 알림을 보냅니다.
- **절차 설정 없음**: 기존 방식대로 부서장(`manage_dpt_codes` 기준)에게 직접 푸시 알림을 보냅니다.

승인 절차는 APVMNG_02에서 설정합니다. 자세한 내용은 [승인 관리 모듈](./approval.md)을 참고하세요.

## 캘린더 (`/calendar`)

`src/app/(main)/calendar/page.tsx`

휴가와 일정을 통합해서 보여주는 캘린더 뷰입니다.

필터 버튼:
- **휴가·일정** (전체 표시)
- **내 일정** (본인 일정만 표시)
