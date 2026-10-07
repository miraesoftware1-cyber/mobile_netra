-- 알림 삭제 주기 설정 테이블
-- PDM DB에 직접 실행

CREATE TABLE IF NOT EXISTS notification_retention_rules (
  company_code    VARCHAR(20)  NOT NULL,
  type            VARCHAR(50)  NOT NULL,
  retention_days  INT,                        -- NULL = 삭제 안 함
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by      VARCHAR(50),
  PRIMARY KEY (company_code, type)
);
