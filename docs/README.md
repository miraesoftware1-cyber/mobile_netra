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

## 빠른 참조

- **앱 주소**: `http://<서버IP>:3001`
- **Gitea**: `http://211.56.248.9:3000`
- **저장소**: `miraesoftware/mobile_netra-test-`
- **배포 대상 경로**: `D:\mobile_netra`
- **PM2 앱 이름**: `mobile-netra`
