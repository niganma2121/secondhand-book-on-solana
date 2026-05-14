-- 买卖双方可各提交一条仲裁材料（主键含 initiator）
ALTER TABLE escrow_dispute_submissions
    DROP CONSTRAINT IF EXISTS escrow_dispute_submissions_pkey;

ALTER TABLE escrow_dispute_submissions
    ADD PRIMARY KEY (escrow_pda, initiator);

COMMENT ON TABLE escrow_dispute_submissions IS '仲裁中买卖双方可各提交一行；公开对质，private_text 仅仲裁员接口返回';
