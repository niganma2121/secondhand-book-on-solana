-- 成交计数幂等：确认收货/对账补偿写入 Released 后仅计一次买卖双方 trade_count
ALTER TABLE escrows
    ADD COLUMN IF NOT EXISTS trade_count_applied BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN escrows.trade_count_applied IS 'Released 后是否已计入 users 成交统计（防重复）';

-- 历史已完结订单视为已计入，避免首次对账重复 +1
UPDATE escrows
SET trade_count_applied = TRUE
WHERE state = 'Released';
