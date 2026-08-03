# 서버 구성 (9번 서버)

Gitea와 Actions Runner는 **9번 서버**에서 운영됩니다. (act_runner v0.2.11, host 모드)

## Gitea

| 항목 | 값 |
|------|----|
| 실행 파일 | `C:\gitea\gitea-1.26.4-windows-4.0-amd64.exe` |
| 실행 명령 | `gitea-1.26.4-windows-4.0-amd64.exe web` |
| 접속 URL | `http://211.56.248.9:3000` |
| 조직 | `miraesoftware` |
| 저장소 | `mobile_netra-test-` |

### Gitea 시작 방법

Gitea는 서비스로 등록되어 있지 않으므로 직접 실행합니다.

```cmd
cd C:\gitea
gitea-1.26.4-windows-4.0-amd64.exe web
```

> **주의**: Smart App Control이 활성화된 경우 gitea.exe 실행이 차단될 수 있습니다.  
> Windows 보안 → 앱 및 브라우저 컨트롤 → 스마트 앱 컨트롤 설정 → **끄기**

---

## Actions Runner (act_runner)

Gitea Actions 워크플로우를 실행하는 runner입니다.

| 항목 | 값 |
|------|----|
| 실행 파일 | `C:\gitea\runner\act_runner-0.2.11-windows-amd64.exe` |
| 실행 명령 | `.\act_runner-0.2.11-windows-amd64.exe daemon` |

### Runner 시작 방법

PowerShell(관리자)에서:

```powershell
cd C:\gitea\runner
.\act_runner-0.2.11-windows-amd64.exe daemon
```

Runner가 오프라인이면 Gitea Actions 워크플로우가 대기 상태로 멈춥니다.  
Gitea 저장소의 Actions 탭에서 Runner 온라인 여부를 확인할 수 있습니다.

---

## 앱 구동 서버 (배포 대상)

실제 Next.js 앱이 실행되는 서버입니다.

| 항목 | 값 |
|------|----|
| 배포 경로 | `D:\mobile_netra` |
| 포트 | `3001` |
| 프로세스 관리 | PM2 (`mobile-netra`) |
| PM2 설정 파일 | `ecosystem.config.js` |

### PM2 수동 조작

```powershell
# 상태 확인
pm2 list

# 재시작
pm2 restart mobile-netra

# 로그 확인
pm2 logs mobile-netra
```

---

## 문제 해결

### Gitea push 거부 (Permission denied)

원인: Windows Smart App Control 또는 AppLocker가 gitea.exe 실행을 차단  
해결: Smart App Control → 끄기 후 gitea.exe 직접 실행

### Runner 오프라인 ("레이블과 일치하는 온라인 러너 없음")

원인: act_runner 프로세스가 종료됨  
해결: `C:\gitea\runner\act_runner-0.2.11-windows-amd64.exe daemon` 재실행

### PM2 stop 단계에서 배포 파이프라인 멈춤

원인: PM2 데몬이 꺼진 상태에서 `pm2 stop` 실행 시 새 데몬을 spawn하며 IPC 대기  
해결: `.gitea/workflows/deploy.yml`의 Stop app 단계에서 PM2 PID 파일 확인 후 데몬이 없으면 skip 처리
