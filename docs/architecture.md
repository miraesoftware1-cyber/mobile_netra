# 아키텍처

## 기술 스택

| 분류 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Next.js (App Router) | ^16.2.1 |
| UI 런타임 | React | ^19.0.0 |
| 스타일링 | Tailwind CSS + shadcn/ui | ^3.4.1 |
| 클라이언트 상태 | Zustand | ^4 |
| 서버 상태 | TanStack React Query | ^5 |
| 폼 | React Hook Form + Zod | ^7 / ^3 |
| 인증/DB | Supabase | ^2.100.1 |
| 이메일 | Nodemailer | ^8.0.5 |
| 아이콘 | Lucide React | ^0.469.0 |
| 날짜 | date-fns + react-day-picker | ^4 / ^9 |
| 애니메이션 | Framer Motion | ^11 |
| 드래그앤드롭 | @dnd-kit | — |

## 디렉토리 구조

```
src/
  app/                  # Next.js App Router
    (auth)/             # 인증 페이지 (로그인)
    (main)/             # 인증 후 메인 레이아웃
      menu/             # 전체 메뉴
      calendar/         # 캘린더
      LEAVE/            # 연차/휴가
      EXP/              # 지출결의
      SCH/              # 일정관리
      DAILY/            # 일용직 인사정보
    api/                # API Route Handlers
      auth/             # 인증 API
      leave/            # 휴가 API
      expense/          # 지출 API
      schedule/         # 일정 API
      daily-worker/     # 일용직 API
      menu-visibility/  # 메뉴 권한 API
      approval/         # 승인 관리 API (list / detail / action / process / emp-search)

  features/             # 도메인별 기능 모듈
    auth/               # 인증 상태(Zustand) + 로그인 폼
    leave/              # 휴가 UI 컴포넌트 + API 클라이언트
    expense/            # 지출 UI 컴포넌트 + API 클라이언트
    menu/               # 메뉴 스토어(Zustand)
    menu-permission/    # 페이지별 권한 훅
    main/               # 하단 탭 네비게이션
    settings/           # 폰트 크기 설정

  components/           # 공통 UI 컴포넌트
    ui/                 # shadcn/ui 컴포넌트
    data-grid/          # 데이터 그리드
    crud-grid/          # CRUD 그리드

  lib/                  # 유틸리티
    erp/                # ERP 서버 URL 조회
    supabase/           # Supabase 클라이언트
    mail/               # 이메일 발송
```

## ERP 연동 구조

```
클라이언트 → Next.js API Route → ERP R2JsonProc.asp (GET)
                               → ERP R2JsonProc_update_holiday.asp (POST, 연차 상태 갱신)
```

모든 ERP 데이터는 서버 사이드 API Route를 통해 프록시됩니다.  
ERP 호출 패턴: `R2JsonProc.asp?proc=<프로시저명>&param1=<파라미터>`

회사 코드로 ERP 서버 URL을 조회하는 로직은 `src/lib/erp/resolve-company-erp-base-url.ts`에 있습니다.

> **R2JsonProc.asp 제약**: SELECT / INSERT(일부 테이블) 는 정상 동작하나, `TB_MOBILE_APVMNG_ACTION`에 대한 INSERT는 ASP 레벨에서 HTTP 500을 반환합니다. 이 경우 PostgreSQL로 우회합니다.

## PostgreSQL (자체 DB)

ERP와 별도로 모바일 앱 전용 데이터를 저장하는 PostgreSQL 데이터베이스입니다.  
연결 설정: `src/lib/db/postgres.ts`

| 테이블 | 설명 |
|--------|------|
| `netra_push_subscriptions` | 푸시 알림 구독 정보 (Web Push) |
| `netra_apvmng_actions` | 승인/반려 처리 이력 (ERP INSERT 우회) |
| `netra_apvmng_requests` | 연차 신청 ↔ 승인 요청 req_id 매핑 (취소 연동용) |

## 상태 관리

| 스토어 | 파일 | 내용 |
|--------|------|------|
| `netra-auth` | `features/auth/hooks/use-auth-store.ts` | 로그인 사용자 정보 (localStorage 영속) |
| 메뉴 스토어 | `features/menu/use-menu-store.ts` | 현재 사용자의 접근 가능 메뉴 목록 |
| 폰트 크기 | `features/settings/hooks/use-font-size-store.ts` | 화면 폰트 크기 설정 |

## 인증 흐름

1. 로그인 → 회사코드 + 전화번호로 ERP 사용자 조회
2. `mobile_flag = 'Y'` 또는 `user_type = 'S'` (시스템관리자) 확인
3. 이메일 인증 활성화 시 OTP 이메일 발송 → 코드 검증
4. Zustand auth store에 사용자 정보 저장 (localStorage 영속)
5. 메뉴 visibility API로 접근 가능 메뉴 조회 → 메뉴 스토어 업데이트
