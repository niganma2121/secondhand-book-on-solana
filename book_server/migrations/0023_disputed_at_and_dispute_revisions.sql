-- 首次进入仲裁时间（用于「最晚处理」展示）；仅在状态变为 Disputed 时写入一次
ALTER TABLE escrows
    ADD COLUMN IF NOT EXISTS disputed_at BIGINT;

COMMENT ON COLUMN escrows.disputed_at IS '链上/对账进入 Disputed 时写入的 Unix 秒；材料更新不改此字段';

-- 每次提交/更新仲裁材料追加一行，便于展示第 1 次、第 2 次…
CREATE TABLE IF NOT EXISTS escrow_dispute_submission_revisions (
    id BIGSERIAL PRIMARY KEY,
    escrow_pda TEXT NOT NULL REFERENCES escrows (escrow_pda) ON DELETE CASCADE,
    initiator TEXT NOT NULL,
    public_text TEXT NOT NULL,
    public_attachment_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    private_text TEXT,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edsr_escrow_created
    ON escrow_dispute_submission_revisions (escrow_pda, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_edsr_escrow_initiator
    ON escrow_dispute_submission_revisions (escrow_pda, initiator, created_at ASC);

COMMENT ON TABLE escrow_dispute_submission_revisions IS '仲裁材料每次保存追加一行；主表 escrow_dispute_submissions 仍为当前版本';

-- 已有材料：补一条历史，避免老数据无「第 1 次」
INSERT INTO escrow_dispute_submission_revisions (escrow_pda, initiator, public_text, public_attachment_urls, private_text, created_at)
SELECT escrow_pda, initiator, public_text, public_attachment_urls, private_text, created_at
FROM escrow_dispute_submissions;
