-- 每笔托管订单一条「下单时刻」书目快照（与 escrow_pda 1:1），避免在 escrow_events 每行重复存整包元数据。
ALTER TABLE escrows
    ADD COLUMN IF NOT EXISTS book_snapshot JSONB;

COMMENT ON COLUMN escrows.book_snapshot IS '创建/复活为 Paid 时从 books + book_images 冻结的快照（JSON）；后续状态变更不重写';
