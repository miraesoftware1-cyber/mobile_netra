# 일용직 인사정보 모듈

## 개요

일용직 근로자 등록 및 조회 기능을 제공합니다.

## 페이지

| 메뉴 ID | 경로 | 이름 |
|---------|------|------|
| DAILY_01 | `/DAILY/DAILY_01` | 일용직 조회 |
| DAILY_02 | `/DAILY/DAILY_02` | 일용직 등록 |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/features/daily-worker/api.ts` | 일용직 API 클라이언트 |
| `src/features/daily-worker/components/daily-worker-inquiry-view.tsx` | 일용직 조회 뷰 |
| `src/features/daily-worker/components/daily-worker-register-form.tsx` | 일용직 등록 폼 |

## API 라우트

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/daily-worker/list` | GET | 일용직 목록 조회 |
| `/api/daily-worker/insert` | POST | 일용직 등록 |
| `/api/daily-worker/corps` | GET | 법인 목록 조회 |
| `/api/daily-worker/names` | GET | 이름 검색 |
