-- 모바일 앱 알림 이력 테이블
CREATE TABLE IF NOT EXISTS mobile_notifications (
    id           SERIAL       PRIMARY KEY,
    company_code VARCHAR(20)  NOT NULL,
    emp_code     VARCHAR(20)  NOT NULL,
    title        VARCHAR(200) NOT NULL,
    body         TEXT,
    type         VARCHAR(50)  NOT NULL DEFAULT 'general',
    ref_data     JSONB,
    sent_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    read_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mobile_notif_lookup
    ON mobile_notifications(company_code, emp_code, sent_at DESC);
 