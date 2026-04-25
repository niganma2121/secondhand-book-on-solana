-- ================================
-- 扩展
-- ================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ================================
-- 用户表
-- ================================
CREATE TABLE IF NOT EXISTS users
(
    pubkey      VARCHAR(44) PRIMARY KEY,
    username    VARCHAR(50),
    avatar      TEXT,
    trade_count INTEGER NOT NULL DEFAULT 0,
    sell_count  INTEGER NOT NULL DEFAULT 0,
    buy_count   INTEGER NOT NULL DEFAULT 0,
    created_at  BIGINT  NOT NULL
);

CREATE UNIQUE INDEX idx_users_username ON users (username)
    WHERE username IS NOT NULL;

-- ================================
-- 书籍表
-- ================================
CREATE TABLE IF NOT EXISTS books
(
    asset         VARCHAR(44) PRIMARY KEY,
    book_pda      VARCHAR(44)  NOT NULL UNIQUE,
    seller        VARCHAR(44)  NOT NULL REFERENCES users (pubkey),
    collection    VARCHAR(44)  NOT NULL,
    price         BIGINT       NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'Listed',
    metadata_url  TEXT         NOT NULL,
    metadata_hash BYTEA        NOT NULL,
    name          VARCHAR(200) NOT NULL,
    cover_url     TEXT,--加封面的oss地址
    author        VARCHAR(100),
    series        VARCHAR(100),
    category      VARCHAR(50)  NOT NULL,
    condition     VARCHAR(20)  NOT NULL,
    search_vec    TSVECTOR,
    created_at    BIGINT       NOT NULL,
    updated_at    BIGINT       NOT NULL
);

CREATE INDEX idx_books_seller ON books (seller);
CREATE INDEX idx_books_status ON books (status);
CREATE INDEX idx_books_seller_status ON books (seller, status);
CREATE INDEX idx_books_price ON books (price);
CREATE INDEX idx_books_category ON books (category);
CREATE INDEX idx_books_search ON books USING GIN (search_vec);
CREATE INDEX idx_books_name_prefix ON books (name varchar_pattern_ops);
CREATE INDEX idx_books_name_trgm ON books USING GIN (name gin_trgm_ops);

-- search_vec 自动更新触发器
CREATE OR REPLACE FUNCTION books_search_vec_update()
    RETURNS trigger AS
$$
BEGIN
    NEW.search_vec := to_tsvector('simple',
                                  coalesce(NEW.name, '') || ' ' ||
                                  coalesce(NEW.author, '') || ' ' ||
                                  coalesce(NEW.series, '') || ' ' ||
                                  coalesce(NEW.category, '')
                      );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER books_search_vec_trigger
    BEFORE INSERT OR UPDATE
    ON books
    FOR EACH ROW
EXECUTE FUNCTION books_search_vec_update();

-- ================================
-- 托管表
-- ================================
CREATE TABLE IF NOT EXISTS escrows
(
    escrow_pda          VARCHAR(44) PRIMARY KEY,
    asset               VARCHAR(44) NOT NULL REFERENCES books (asset),
    seller              VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    buyer               VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    price               BIGINT      NOT NULL,
    state               VARCHAR(20) NOT NULL DEFAULT 'Paid',
    shipping_commitment BYTEA,
    created_at          BIGINT      NOT NULL,
    updated_at          BIGINT      NOT NULL
);

CREATE INDEX idx_escrows_buyer ON escrows (buyer);
CREATE INDEX idx_escrows_seller ON escrows (seller);
CREATE INDEX idx_escrows_asset ON escrows (asset);

-- ================================
-- 评价表
-- ================================
CREATE TABLE IF NOT EXISTS reviews
(
    id         BIGINT PRIMARY KEY,
    escrow_pda VARCHAR(44) NOT NULL REFERENCES escrows (escrow_pda),
    reviewer   VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    reviewee   VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    score      SMALLINT    NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment    TEXT,
    created_at BIGINT      NOT NULL,
    UNIQUE (escrow_pda, reviewer)
);

CREATE INDEX idx_reviews_reviewee ON reviews (reviewee);

-- ================================
-- 消息表
-- ================================
CREATE TABLE IF NOT EXISTS messages
(
    id          BIGINT PRIMARY KEY,
    from_pubkey VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    to_pubkey   VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    content     JSONB       NOT NULL,
    timestamp   BIGINT      NOT NULL,
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_messages_conversation ON messages (
                                                    LEAST(from_pubkey, to_pubkey),
                                                    GREATEST(from_pubkey, to_pubkey),
                                                    id
    );

CREATE INDEX idx_messages_unread ON messages (to_pubkey, is_read, id)
    WHERE is_read = FALSE;

CREATE TABLE IF NOT EXISTS favorites
(
    user_pubkey VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    asset       VARCHAR(44) NOT NULL REFERENCES books (asset),
    created_at  BIGINT      NOT NULL,
    PRIMARY KEY (user_pubkey, asset)
);

-- 查某本书被多少人收藏
CREATE INDEX idx_favorites_asset ON favorites (asset);


CREATE TABLE IF NOT EXISTS book_images
(
    id BIGINT PRIMARY KEY,
    asset VARCHAR(44) NOT NULL REFERENCES books
        (
         asset
            ),
    url        TEXT        NOT NULL,
    sort       SMALLINT    NOT NULL DEFAULT 0,
    created_at BIGINT      NOT NULL
);

CREATE INDEX idx_book_images_asset ON book_images (asset);