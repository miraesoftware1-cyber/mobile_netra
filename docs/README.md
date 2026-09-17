# mobile-netra 프로젝트 문서

Next.js 기반 모바일 ERP 동반 앱 (연차/휴가, 지출결의, 일정관리, 일용직 인사정보)

## 문서 목차

| 파일 | 내용 |
|------|------|
| [server-setup.md](./server-setup.md) | Gitea 서버 및 Actions Runner 구성 (9번 서버) |
| [deployment.md](./deployment.md) | 배포 파이프라인 (Gitea Actions + PM2) |
| [architecture.md](./architecture.md) | 전체 아키텍처 및 기술 스택 |
| [modules/auth.md](./modules/auth.md) | 인증 모듈 (로그인, 이메일 인증) |
| [modules/menu.md](./modules/menu.md) | 메뉴 및 권한 관리 |
| [modules/leave.md](./modules/leave.md) | 연차/휴가 모듈 |
| [modules/expense.md](./modules/expense.md) | 지출결의 모듈 |
| [modules/schedule.md](./modules/schedule.md) | 일정관리 모듈 |
| [modules/daily-worker.md](./modules/daily-worker.md) | 일용직 인사정보 모듈 |
| [modules/approval.md](./modules/approval.md) | 승인 관리 모듈 (APVMNG) |
| [메뉴-APVMNG_01.md](./메뉴-APVMNG_01.md) | 승인 현황 — 대기/완료 목록, 승인·반려 처리 |
| [메뉴-APVMNG_02.md](./메뉴-APVMNG_02.md) | 승인 절차 설정 — MyBuilder 관리, 앱은 조회 전용 |
| [메뉴-APVMNG_03.md](./메뉴-APVMNG_03.md) | 승인 절차 현황 — 타임라인 조회, 푸시 버튼 설정 |

## 빠른 참조

- **앱 주소**: `http://<서버IP>:3001`
- **Gitea**: `http://211.56.248.9:3000`
- **저장소**: `miraesoftware/mobile_netra-test-`
- **배포 대상 경로**: `D:\mobile_netra`
- **PM2 앱 이름**: `mobile-netra`

## 최근 변경사항

### 인증 (auth)

- **SMS OTP 기기 신뢰**: SMS OTP 인증 완료 시 해당 기기를 `deviceTokenMap`에 등록. 이후 동일 기기(companyCode+phoneNumber 조합)로 로그인하면 OTP 단계 건너뜀. `sms_enabled=true`(attribute1=Y) 회사에만 적용.
- **마지막 로그인 자동 채우기**: 로그인 성공 시 `lastLoginCompanyCode`, `lastLoginPhoneNumber` 저장. 로그아웃 후에도 유지되며, 로그인 폼 마운트 시 자동으로 입력 필드에 채워짐.

### 일정관리 (SCH_01)

- **HourPicker 커스텀 피커**: native select 제거 → 팝오버 기반 1열 세로 스크롤 그리드. AM(00~11시)/PM(12~23시) 탭 구분. 고정 px 폰트로 OS 폰트 크기 영향 차단. 컨테이너 `min-h-[44px]` 적용.
- **날짜 피커 개선**: `overflow-hidden` 적용, 고정 px 폰트, 아이콘 여백 조정.

### 레이아웃

- **루트 배경색**: `bg-gray-50` → `bg-white` (하단 회색 바 제거)
- **iOS PWA 높이**: `h-dvh` → `h-screen` (dvh 불안정 문제 해결)
- **safe-area 이중 적용 제거**: main의 `pb-[calc(4rem+safe-area)]` → `pb-16`
