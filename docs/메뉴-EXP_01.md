# 지출결의 등록 (EXP_01)

## 개요

- **경로**: `src/app/(main)/EXP/EXP_01/page.tsx` → `features/expense/components/expense-resolution-form.tsx`
- **접근 권한**: 전체 사용자
- 지출결의서를 작성하고 영수증(이미지/PDF)을 첨부해 ERP에 등록한다.

## 구현 방식

- 폼 상태: `react-hook-form` + zod.
- `결의일자`(오늘 고정)·`결의자`(사원명 고정)는 읽기 전용.
- 결재자가 1명이면 자동 선택 + 읽기 전용 표시.
- 지급 유형에 "법인카드" 포함 시 카드 끝 4자리 입력 필드 활성화.
- `summary` 필드: UTF-8 바이트 기준 100바이트 제한 (MSSQL varchar(100) 대응 — 문자 수가 아닌 바이트 수 이진탐색 truncate).
- 영수증 파일: 최대 10개, 업로드 전 파일명을 `YYYYMMDD_사원명_사원코드_HHmmssSSS_NN.ext` 형식으로 변경. 이미지는 인라인 썸네일 표시, PDF는 파일 아이콘.
- 제출 중 전체화면 로딩 오버레이로 중복 제출 방지.

## 작동 흐름

1. 진입 시 지급 유형·결의 항목·결재자·프로젝트 목록 동시 조회
2. 사용자가 폼 입력 + 영수증 첨부
3. 제출 → (파일이 있으면) `/api/expense/upload-receipts`로 ERP 파일 서버 업로드
4. 업로드 완료 후 `usp_mobile_insert_expense` 호출
5. 성공 → 결과 다이얼로그 → `/menu` 이동 / 실패 → 에러 다이얼로그 (페이지 유지)

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/expense/pay-types` | `usp_mobile_get_mst_code('BSLIP_PAYTYPE')` | — |
| `GET /api/expense/resolution-items` | `usp_mobile_get_expense_item` | — |
| `GET /api/expense/approver` | `usp_mobile_get_expense_approver` | param1=emp_code |
| `GET /api/expense/projects` | `usp_mobile_get_expense_project` | — |
| `POST /api/expense/upload-receipts` | ERP 파일 서버 FTP | — |
| `POST /api/expense/insert-resolution` | `usp_mobile_insert_expense` | param1=corpCode, param2=resolutionDate, param3=empCode, param4=projectCode, param5=approverCode, param6=resolutionItemCode, param7=vendor, param8=summary, param9=supplyAmount, param10=vatAmount, param11=paymentTypeCode, param12=expenseDate, param13=receiptPath, param14=receiptFileNames(콤마구분), param15=phoneNumber |

### 주요 데이터 흐름

| 데이터 | 출처 | 사용처 |
|--------|------|--------|
| 지급 유형 | `usp_mobile_get_mst_code` | 드롭다운, 법인카드 여부 판단 (`c_attr3=Y`는 기본 선택) |
| 결재자 목록 | `usp_mobile_get_expense_approver` | 드롭다운 (1명이면 자동 선택) |
| 영수증 파일 경로 | `/api/expense/upload-receipts` 응답 | `receiptPath`, `receiptFileNames` → `insert-resolution` 전달 |

### 주의사항

- `receiptPath`는 백슬래시(`\`) Windows 경로 포맷 — ERP 서버가 요구하는 형식.
- `vatAmount` 빈 값은 API에서 `"0"`으로 강제 변환.
