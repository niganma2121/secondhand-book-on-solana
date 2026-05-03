-- 书籍分类字典：`books.category` 存 `key`，列表/筛选展示 `label_zh`
CREATE TABLE IF NOT EXISTS book_categories
(
    key        VARCHAR(50) PRIMARY KEY,
    label_zh   VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO book_categories (key, label_zh, sort_order)
VALUES ('literature', '文学小说', 10),
       ('scifi', '科幻奇幻', 20),
       ('science', '科学技术', 30),
       ('business', '商业经济', 40),
       ('history', '历史文化', 50),
       ('art', '艺术设计', 60),
       ('education', '教育学习', 70),
       ('other', '其他', 100)
ON CONFLICT (key) DO NOTHING;
