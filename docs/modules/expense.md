# 지출결의 모듈

## 개요

지출결의서 작성 및 조회 기능을 제공합니다.  
영수증 이미지 첨부 및 핀치줌 미리보기를 지원합니다.

## 페이지

| 메뉴 ID | 경로 | 이름 |
|---------|------|------|
| EXP_01 | `/EXP/EXP_01` | 지출결의 작성 |
| EXP_02 | `/EXP/EXP_02` | 지출결의 조회 |

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/app/(main)/EXP/EXP_01/page.tsx` | 지출결의 작성 폼 페이지 |
| `src/app/(main)/EXP/EXP_02/page.tsx` | 지출결의 조회 페이지 |
| `src/features/expense/api.ts` | 지출 API 클라이언트 |
| `src/features/expense/components/expense-resolution-form.tsx` | 지출결의 작성 폼 |
| `src/features/expense/components/expense-inquiry-view.tsx` | 지출결의 조회 뷰 |
| `src/features/expense/components/receipt-image-pinch-preview.tsx` | 영수증 핀치줌 미리보기 |
| `src/features/expense/components/expense-project-picker.tsx` | 프로젝트 선택 컴포넌트 |
| `src/features/expense/hooks/use-expense-projects-query.ts` | 프로젝트 목록 조회 훅 |

## API 라우트

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/expense/expense-list` | GET | 지출결의 목록 조회 |
| `/api/expense/resolution-items` | GET | 결의 항목 조회 |
| `/api/expense/insert-resolution` | POST | 지출결의 등록 |
| `/api/expense/pay-types` | GET | 지급 유형 목록 |
| `/api/expense/projects` | GET | 프로젝트 목록 |
| `/api/expense/approver` | GET | 결재자 정보 |
| `/api/expense/upload-receipts` | POST | 영수증 이미지 업로드 |

## 영수증 이미지

`react-zoom-pan-pinch` 라이브러리로 핀치 줌 미리보기를 구현합니다.  
이미지 업로드는 `/api/expense/upload-receipts`를 통해 처리됩니다.
