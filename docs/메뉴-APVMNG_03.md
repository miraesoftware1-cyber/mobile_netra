# 승인 절차 현황 (APVMNG_03)

## 개요

- **경로**: `src/app/(main)/APVMNG/APVMNG_03/page.tsx`
- **접근 권한**: ERP DB `usp_mobile_get_env_mobile_permission` 기준
- 현재 설정된 메뉴별 승인 절차를 타임라인 형태로 읽기 전용 조회한다.
- 단계별 승인자·유형·threshold·전결·푸시 알림 설정 현황을 한눈에 확인할 수 있다.
- 푸시 알림 버튼 설정(승인/반려 버튼 라벨·동작)도 이 화면에서 변경한다.

## 구현 방식

- 지원 메뉴(`LEAVE_01`, `EXP_01`)를 카드로 나열. 각 카드는 펼치기/접기 가능.
- 단계 타임라인: 원형 번호 + 세로선 연결, step_type 코드 표시 (requester·team_leader·dept_head·div_head·ceo).
  - `requester`(담당) 단계는 "접수 확인 푸시" 라벨로 구분 표시.
- 단계별 푸시 메시지 수정 섹션: 저장 시 `POST /api/approval/process` → PG `netra_apvmng_step_msg` 저장.
- 푸시 버튼 설정 섹션(`PushConfigSection`)은 카드 하단 접기식. 변경 후 저장 버튼으로 PG에 반영.
- iOS 푸시 버튼 미지원 안내 배너 포함.
- `user_id ≠ emp_code` 거래처에서도 공통 패턴 동일 적용.

## 작동 흐름

1. 진입 시 지원 메뉴별 `GET /api/approval/process` + `GET /api/approval/push-config` 병렬 조회
2. 카드 펼치기 → 단계 타임라인 표시
3. 푸시 설정 섹션 펼치기 → 버튼 라벨·동작 변경 → 저장 → `PUT /api/approval/push-config`

## 연동 관계

| API 경로 | ERP 프로시저 | 파라미터 |
|----------|-------------|---------|
| `GET /api/approval/process` | `usp_mobile_apvmng_process_get` | param1=MENU_ID |
| `GET /api/approval/push-config` | — | PG `netra_push_config` 조회 |
| `PUT /api/approval/push-config` | — | PG `netra_push_config` 갱신 |

## 표시 요소

| 배지 | 조건 | 색상 |
|------|------|------|
| `접수 확인` | step_type = requester | 회색 |
| `전결` | `allowFinalDecision = true` | 초록 |
| `알림` | `pushEnabled = true` | 초록 |

## 주의사항

- **읽기 전용 화면**: 절차 변경은 MyBuilder에서만 가능. 푸시 버튼 설정만 앱에서 저장.
- iOS는 푸시 버튼(승인/반려)을 지원하지 않음. 알림 탭 시 상세 화면으로 이동.
