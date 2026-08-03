# 인증 모듈

## 개요

회사코드 + 전화번호로 ERP에서 사용자를 조회하여 로그인합니다.  
선택적으로 이메일 OTP 인증을 추가할 수 있습니다.

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/app/(auth)/login/page.tsx` | 로그인 페이지 |
| `src/features/auth/components/login-form.tsx` | 로그인 폼 컴포넌트 |
| `src/features/auth/hooks/use-auth-store.ts` | 인증 상태 (Zustand, localStorage 영속) |
| `src/features/auth/api.ts` | 인증 API 클라이언트 |
| `src/app/api/auth/login/route.ts` | 로그인 API Route |
| `src/app/api/auth/request-email-code/route.ts` | 이메일 인증코드 발송 API |
| `src/app/api/auth/verify-email-code/route.ts` | 이메일 인증코드 검증 API |
| `src/app/api/auth/_lib/email-code-store.ts` | 인증코드 인메모리 저장소 |
| `src/app/api/auth/_lib/email-verification-enabled.ts` | 이메일 인증 활성화 여부 |

## 로그인 API (`POST /api/auth/login`)

### 요청

```json
{
  "companyCode": "회사코드",
  "phoneNumber": "010XXXXXXXX"
}
```

### 처리 흐름

1. 회사코드로 ERP 서버 URL 조회 (`resolve-company-erp-base-url`)
2. ERP `usp_mobile_get_emp_info` 프로시저로 사용자 조회 (param1=전화번호)
3. 접근 권한 확인:
   - `user_type = 'S'` (시스템관리자) → 무조건 통과
   - `mobile_flag = 'Y'` → 통과
   - 그 외 → 403 오류
4. 이메일 인증이 활성화된 경우 `emailVerificationEnabled: true` 반환
5. 사용자 정보 반환

### 반환 데이터

```json
{
  "emailVerificationEnabled": false,
  "corp_code": "...",
  "corp_name": "...",
  "dpt_code": "...",
  "dpt_name": "...",
  "emp_code": "...",
  "emp_name": "...",
  "user_id": "...",
  "user_type": "N" | "S",
  "email": "..."
}
```

## 사용자 타입

| user_type | 설명 |
|-----------|------|
| `N` | 일반 사용자 — mobile_flag=Y 필요, 권한관리에 등록된 메뉴만 접근 |
| `S` | 시스템관리자 — mobile_flag 무관, 모든 메뉴 전체 권한 |

## auth store (`netra-auth`)

로컬스토리지에 영속되는 Zustand 스토어입니다.

```ts
interface AuthUser {
  companyCode: string;
  phoneNumber: string;
  email: string;
  corp_code: string;
  corp_name: string;
  dpt_code: string;
  dpt_name: string;
  leader_flag: string;
  manage_dpt_codes: string;
  manage_dpt_names: string;
  emp_code: string;
  emp_name: string;
  user_id: string;
  user_type: string;
}
```

## 이메일 인증 (선택)

환경 변수 설정 시 활성화됩니다. 활성화되면:

1. 로그인 요청 → 사용자 이메일로 6자리 OTP 발송
2. OTP 입력 → `/api/auth/verify-email-code`로 검증
3. 검증 성공 → 로그인 완료

인증코드는 서버 인메모리(`email-code-store.ts`)에 TTL과 함께 저장됩니다.
