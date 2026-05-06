-- 书籍价格补充字段：
-- - price_cny: 卖家上架时填写的人民币价格（业务展示用）
-- - fx_cny_per_sol: 上架时参考汇率快照（便于回溯）
ALTER TABLE books
    ADD COLUMN IF NOT EXISTS price_cny DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS fx_cny_per_sol DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_books_price_cny ON books (price_cny);
