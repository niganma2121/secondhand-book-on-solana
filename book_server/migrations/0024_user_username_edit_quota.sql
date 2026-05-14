-- 昵称修改频次（按 UTC 自然日）与计数
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username_edit_day INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS username_edit_count INTEGER NOT NULL DEFAULT 0;
