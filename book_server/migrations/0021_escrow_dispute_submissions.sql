-- 仲裁材料（链下）：公开区对买卖双方可见；private_text 仅仲裁员可读
CREATE TABLE IF NOT EXISTS escrow_dispute_submissions
(
    escrow_pda              VARCHAR(44) PRIMARY KEY
        REFERENCES escrows (escrow_pda) ON DELETE CASCADE,
    initiator               VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    public_text             TEXT        NOT NULL,
    public_attachment_urls  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    private_text            TEXT,
    created_at              BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escrow_dispute_submissions_initiator
    ON escrow_dispute_submissions (initiator);

COMMENT ON TABLE escrow_dispute_submissions IS '发起仲裁后由发起方提交；公开内容可对质，private_text 仅仲裁员接口返回';
