-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    pubkey VARCHAR(44) PRIMARY KEY,
    username VARCHAR(50) DEFAULT '新书友',
    avatar_url TEXT,
    last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 书籍表
CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    owner_pubkey VARCHAR(44) NOT NULL REFERENCES users(pubkey),
    mint_address VARCHAR(44) UNIQUE, -- 对应链上 NFT
    title VARCHAR(255) NOT NULL,
    price DECIMAL(20, 9) NOT NULL,   -- 挂牌价
    deal_price DECIMAL(20, 9),       -- 最终成交价（初始可为空）
    status INT DEFAULT 1,            -- 1:在售, 2:议价中, 3:锁定, 4:已售, 0:下架
    metadata JSONB DEFAULT '{}',     -- 存储书籍详情：作者、成色等
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. 消息表（增加关联）
CREATE TABLE IF NOT EXISTS messages (
    id BIGINT PRIMARY KEY,           -- 雪花ID
    sender VARCHAR(44) NOT NULL REFERENCES users(pubkey),
    receiver VARCHAR(44) NOT NULL REFERENCES users(pubkey),
    content TEXT NOT NULL,
    msg_type SMALLINT DEFAULT 1,
    is_read BOOLEAN DEFAULT FALSE,
    created_at BIGINT NOT NULL       -- 使用毫秒时间戳
    );

-- 4. 交易/砍价记录表（新增，解决你说的砍价问题）
CREATE TABLE IF NOT EXISTS offers (
                                      id SERIAL PRIMARY KEY,
                                      book_id INT REFERENCES books(id),
    buyer_pubkey VARCHAR(44) REFERENCES users(pubkey),
    offer_price DECIMAL(20, 9) NOT NULL,
    status INT DEFAULT 0             -- 0:待处理, 1:卖家接受, 2:卖家拒绝, 3:已完成支付
    );

-- 联合索引：加速 A 与 B 之间的消息查询，并按 ID 倒序排列（获取最新消息）
CREATE INDEX idx_messages_pair ON messages (sender, receiver, id DESC);

-- 索引：加速“查询发给我的未读消息”
CREATE INDEX idx_messages_receiver_unread ON messages (receiver) WHERE is_read = FALSE;
-- 索引：加速查询某个用户的上架书籍（个人中心展示）
CREATE INDEX idx_books_owner ON books (owner_pubkey);

-- 索引：加速通过状态筛选书籍（比如广场只显示 status=1 的在售书籍）
CREATE INDEX idx_books_status ON books (status);
-- 联合索引：查询某本书下的所有出价（卖家看谁出价高）
CREATE INDEX idx_offers_book_price ON offers (book_id, offer_price DESC);

-- 索引：查询某位买家发出的所有出价（买家看自己的出价历史）
CREATE INDEX idx_offers_buyer ON offers (buyer_pubkey);
-- 可选：如果你有搜索用户功能
CREATE INDEX idx_users_username ON users (username);