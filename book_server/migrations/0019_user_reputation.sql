-- 用户信誉与仲裁汇总（链下聚合；明细仍以 escrow_events / 链上为准）
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reputation_score DOUBLE PRECISION NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS dispute_total INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispute_won INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispute_lost INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.reputation_score IS '信誉分 0–100，默认 100；仲裁裁决等事件增减';
COMMENT ON COLUMN users.dispute_total IS '参与并已结案的仲裁次数（买卖双方各计一次参与）';
COMMENT ON COLUMN users.dispute_won IS '仲裁胜诉次数';
COMMENT ON COLUMN users.dispute_lost IS '仲裁败诉次数';
