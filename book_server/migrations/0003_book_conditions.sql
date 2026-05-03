-- 品相字典：`books.condition` 存 `key`（与 CHECK 一致），展示用 `label_zh` / `description_zh`
CREATE TABLE IF NOT EXISTS book_conditions
(
    key             VARCHAR(50) PRIMARY KEY,
    label_zh        VARCHAR(100) NOT NULL,
    description_zh  TEXT,
    sort_order      INT NOT NULL DEFAULT 0
);

INSERT INTO book_conditions (key, label_zh, description_zh, sort_order)
VALUES ('New', '全新', '未使用，无任何痕迹', 10),
       ('LikeNew', '近全新', '轻微使用，几乎无痕迹', 20),
       ('Good', '良好', '正常翻阅痕迹，无破损', 30),
       ('Fair', '一般', '有笔记或折角，不影响阅读', 40),
       ('Poor', '较差', '明显破损，仍可阅读', 50)
ON CONFLICT (key) DO NOTHING;
