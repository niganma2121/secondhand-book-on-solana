-- 托管流水扩展：仲裁结案等结构化说明（JSON）
ALTER TABLE escrow_events
    ADD COLUMN IF NOT EXISTS payload JSONB;
