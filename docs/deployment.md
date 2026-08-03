# 배포 파이프라인

`main` 브랜치에 push하면 Gitea Actions가 자동으로 배포를 수행합니다.

## 흐름

```
git push origin main
  → Gitea (211.56.248.9:3000) 수신
  → Actions Runner (9번 서버) 워크플로우 실행
  → 배포 대상 서버에서 빌드 + PM2 재시작
```

## 워크플로우 단계 (`.gitea/workflows/deploy.yml`)

| 단계 | 내용 |
|------|------|
| **Pull code** | `D:\mobile_netra`에서 git fetch + reset --hard로 최신 코드 반영 |
| **Stop app** | PM2 데몬이 실행 중이면 `pm2 stop mobile-netra` 실행 (데몬 없으면 skip) |
| **Install deps** | `npm ci`로 의존성 설치 |
| **Build** | `.next` 캐시 삭제 후 `npm run build` |
| **Start app** | `pm2 startOrRestart ecosystem.config.js` |

### Stop app 단계 상세

PM2 데몬이 없는 상태에서 `pm2 stop`을 실행하면 새 데몬을 spawn하며 IPC 대기로 파이프라인이 멈춥니다.  
이를 방지하기 위해 `C:\Users\admin\.pm2\pm2.pid` 파일로 데몬 실행 여부를 먼저 확인합니다.

```powershell
$pidFile = "C:\Users\admin\.pm2\pm2.pid"
$daemonRunning = $false
if (Test-Path $pidFile) {
  $pm2Pid = [int]((Get-Content $pidFile -Raw).Trim())
  $daemonRunning = $null -ne (Get-Process -Id $pm2Pid -ErrorAction SilentlyContinue)
}
if ($daemonRunning) {
  & cmd /c "pm2 stop mobile-netra --kill-timeout 5000 2>nul"
} else {
  Write-Host "PM2 daemon not running, skipping stop"
}
```

## PM2 설정 (`ecosystem.config.js`)

```js
module.exports = {
  apps: [{
    name: "mobile-netra",
    script: "npm",
    args: "start -- --port 3001",
    cwd: "D:\\mobile_netra",
  }]
}
```

## 환경 변수

배포 대상 서버의 `D:\mobile_netra\.env.local`에 설정합니다.  
Gitea Secrets에는 `DEPLOY_TOKEN` (git 인증용)이 등록되어 있습니다.
