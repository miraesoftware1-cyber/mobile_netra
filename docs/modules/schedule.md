# 일정관리 모듈

## 개요

사내 일정 조회 및 등록/수정/삭제 기능을 제공합니다.  
캘린더 뷰와 연동되어 휴가·일정을 통합 표시합니다.

## 페이지

| 메뉴 ID | 경로 | 이름 |
|---------|------|------|
| SCH_01 | `/SCH/SCH_01` | 일정 조회 |
| SCH_02 | `/SCH/SCH_02` | 일정 등록/수정/삭제 |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/app/(main)/SCH/SCH_01/page.tsx` | 일정 조회 페이지 |
| `src/app/(main)/SCH/SCH_02/page.tsx` | 일정 CRUD 페이지 |
| `src/app/(main)/calendar/page.tsx` | 통합 캘린더 뷰 |
| `src/app/api/schedule/route.ts` | 일정 조회 API |
| `src/app/api/schedule-crud/route.ts` | 일정 등록/수정/삭제 API |

## API 라우트

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/schedule` | GET | 일정 목록 조회 |
| `/api/schedule-crud` | POST | 일정 등록 |
| `/api/schedule-crud` | PUT | 일정 수정 |
| `/api/schedule-crud` | DELETE | 일정 삭제 |

## SCH_02 UI 특징

- **내 일정 / 전체 일정 토글**: 우상단 버튼으로 토글
  - **전체 일정** 모드: 황색(amber) 배경
  - **내 일정** 모드: 하늘색(sky blue) 배경
- **날짜 선택**: 특정 날짜 클릭 시 해당 날짜의 일정만 표시, 타이틀에 날짜 표시
- **필터 버튼**: 카테고리별 필터 (전체는 "휴가·일정"으로 표시)

## 캘린더 통합 뷰 (`/calendar`)

`src/app/(main)/calendar/page.tsx`에서 휴가와 일정을 함께 표시합니다.

필터 버튼 레이블:
- `all` → **휴가·일정** (전체 표시)
- 그 외 → 해당 카테고리명
