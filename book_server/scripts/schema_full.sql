-- =============================================================================
-- 合并自 book_server/migrations/0001 … 0025 的最终库结构（新库一次性执行）
--
-- 用途：
--   - 给 DBA / 部署脚本审阅「当前完整 DDL」
--   - 在无 Rust 迁移工具、或需要单独 SQL 包的环境里手工初始化空库
--
-- 注意（与 book_server 默认行为的关系）：
--   应用启动时会执行 sqlx::migrate!("./migrations")，若库已由本文件建完表，
--   再跑迁移会因对象已存在而失败。二者只选其一：
--     A) 空库 → 只启动应用，让 sqlx 按 migrations 目录逐条跑；或
--     B) 空库 → 只执行本文件，并自行在应用侧关闭自动 migrate（需改代码）。
--   已有数据的生产库请继续使用原编号迁移链，不要用本文件覆盖。
-- =============================================================================

-- ================================
-- 扩展
-- ================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ================================
-- 用户表（含后续迁移列）
-- ================================
CREATE TABLE IF NOT EXISTS users
(
    pubkey               VARCHAR(44) PRIMARY KEY,
    username             VARCHAR(50),
    avatar               TEXT,
    trade_count          INTEGER NOT NULL DEFAULT 0,
    sell_count           INTEGER NOT NULL DEFAULT 0,
    buy_count            INTEGER NOT NULL DEFAULT 0,
    created_at           BIGINT  NOT NULL,
    enc_pubkey           TEXT,
    reputation_score     DOUBLE PRECISION NOT NULL DEFAULT 100,
    dispute_total        INTEGER NOT NULL DEFAULT 0,
    dispute_won          INTEGER NOT NULL DEFAULT 0,
    dispute_lost         INTEGER NOT NULL DEFAULT 0,
    username_edit_day    INTEGER NOT NULL DEFAULT 0,
    username_edit_count  INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)
    WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_enc_pubkey_not_null
    ON users (pubkey)
    WHERE enc_pubkey IS NOT NULL;

COMMENT ON COLUMN users.reputation_score IS '信誉分 0–100，默认 100；仲裁裁决等事件增减';
COMMENT ON COLUMN users.dispute_total IS '参与并已结案的仲裁次数（买卖双方各计一次参与）';
COMMENT ON COLUMN users.dispute_won IS '仲裁胜诉次数';
COMMENT ON COLUMN users.dispute_lost IS '仲裁败诉次数';

-- ================================
-- 书籍分类 / 品相字典
-- ================================
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

-- ================================
-- 书籍表（含法币价格字段）
-- ================================
CREATE TABLE IF NOT EXISTS books
(
    asset           VARCHAR(44)  PRIMARY KEY,
    book_pda        VARCHAR(44)  NOT NULL UNIQUE,
    seller          VARCHAR(44)  NOT NULL REFERENCES users (pubkey),
    collection      VARCHAR(44)  NOT NULL,
    price           BIGINT       NOT NULL,
    price_cny       DOUBLE PRECISION,
    fx_cny_per_sol  DOUBLE PRECISION,
    status          VARCHAR(20)  NOT NULL DEFAULT 'Listed'
        CHECK (status IN ('Listed', 'InEscrow', 'Sold', 'DeListed')),
    metadata_url    TEXT         NOT NULL,
    metadata_hash   BYTEA        NOT NULL,
    name            VARCHAR(200) NOT NULL,
    cover_url       TEXT,
    author          VARCHAR(100),
    series          VARCHAR(100),
    category        VARCHAR(50)  NOT NULL,
    condition       VARCHAR(20)  NOT NULL
        CHECK (condition IN ('New', 'LikeNew', 'Good', 'Fair', 'Poor')),
    search_vec      TSVECTOR,
    created_at      BIGINT       NOT NULL,
    updated_at      BIGINT       NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_books_seller        ON books (seller);
CREATE INDEX IF NOT EXISTS idx_books_status        ON books (status);
CREATE INDEX IF NOT EXISTS idx_books_seller_status ON books (seller, status);
CREATE INDEX IF NOT EXISTS idx_books_price         ON books (price);
CREATE INDEX IF NOT EXISTS idx_books_price_cny     ON books (price_cny);
CREATE INDEX IF NOT EXISTS idx_books_category      ON books (category);
CREATE INDEX IF NOT EXISTS idx_books_search        ON books USING GIN (search_vec);
CREATE INDEX IF NOT EXISTS idx_books_name_prefix   ON books (name varchar_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_books_name_trgm     ON books USING GIN (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION books_search_vec_update()
    RETURNS trigger AS
$$
BEGIN
    NEW.search_vec := to_tsvector(
            'simple',
            coalesce(NEW.name, '')     || ' ' ||
            coalesce(NEW.author, '')   || ' ' ||
            coalesce(NEW.series, '')   || ' ' ||
            coalesce(NEW.category, '')
                      );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS books_search_vec_trigger ON books;
CREATE TRIGGER books_search_vec_trigger
    BEFORE INSERT OR UPDATE ON books
    FOR EACH ROW
EXECUTE FUNCTION books_search_vec_update();

-- ================================
-- 书籍图片表
-- ================================
CREATE TABLE IF NOT EXISTS book_images
(
    id         BIGINT      PRIMARY KEY,
    asset      VARCHAR(44) NOT NULL REFERENCES books (asset) ON DELETE CASCADE,
    url        TEXT        NOT NULL,
    sort       SMALLINT    NOT NULL DEFAULT 0,
    created_at BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_book_images_asset ON book_images (asset);

-- ================================
-- 托管表（含后续迁移列）
-- ================================
CREATE TABLE IF NOT EXISTS escrows
(
    escrow_pda           VARCHAR(44) PRIMARY KEY,
    asset                VARCHAR(44) NOT NULL REFERENCES books (asset),
    seller               VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    buyer                VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    price                BIGINT      NOT NULL,
    state                VARCHAR(20) NOT NULL DEFAULT 'Paid'
        CHECK (state IN ('Paid', 'Shipped', 'Released', 'Cancelled', 'Disputed')),
    shipping_commitment  BYTEA,
    created_at           BIGINT      NOT NULL,
    updated_at           BIGINT      NOT NULL,
    cancelled_by         VARCHAR(44) REFERENCES users (pubkey),
    trade_count_applied  BOOLEAN     NOT NULL DEFAULT FALSE,
    book_snapshot        JSONB,
    pre_ship_locked      BOOLEAN     NOT NULL DEFAULT FALSE,
    disputed_at          BIGINT
);

CREATE INDEX IF NOT EXISTS idx_escrows_buyer  ON escrows (buyer);
CREATE INDEX IF NOT EXISTS idx_escrows_seller ON escrows (seller);
CREATE INDEX IF NOT EXISTS idx_escrows_asset  ON escrows (asset);
CREATE INDEX IF NOT EXISTS idx_escrows_cancelled_by ON escrows (cancelled_by);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escrows_asset_active
    ON escrows (asset)
    WHERE state IN ('Paid', 'Shipped');

COMMENT ON COLUMN escrows.trade_count_applied IS 'Released 后是否已计入 users 成交统计（防重复）';
COMMENT ON COLUMN escrows.book_snapshot IS '创建/复活为 Paid 时从 books + book_images 冻结的快照（JSON）；后续状态变更不重写';
COMMENT ON COLUMN escrows.pre_ship_locked IS 'Paid 状态下卖家锁单备发货：买家不可改址/取消（本站）；卖家可取消';
COMMENT ON COLUMN escrows.disputed_at IS '链上/对账进入 Disputed 时写入的 Unix 秒；材料更新不改此字段';

-- ================================
-- 评价表
-- ================================
CREATE TABLE IF NOT EXISTS reviews
(
    id         BIGINT      PRIMARY KEY,
    escrow_pda VARCHAR(44) NOT NULL REFERENCES escrows (escrow_pda),
    reviewer   VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    reviewee   VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    score      SMALLINT    NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment    TEXT,
    created_at BIGINT      NOT NULL,
    UNIQUE (escrow_pda, reviewer)
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews (reviewee);

-- ================================
-- 消息表
-- ================================
CREATE TABLE IF NOT EXISTS messages
(
    id          BIGINT      PRIMARY KEY,
    from_pubkey VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    to_pubkey   VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    content     JSONB       NOT NULL,
    timestamp   BIGINT      NOT NULL,
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (
    LEAST(from_pubkey, to_pubkey),
    GREATEST(from_pubkey, to_pubkey),
    id
);

CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (to_pubkey, id)
    WHERE is_read = FALSE;

-- ================================
-- 收藏表
-- ================================
CREATE TABLE IF NOT EXISTS favorites
(
    user_pubkey VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    asset       VARCHAR(44) NOT NULL REFERENCES books (asset),
    created_at  BIGINT      NOT NULL,
    PRIMARY KEY (user_pubkey, asset)
);

CREATE INDEX IF NOT EXISTS idx_favorites_asset ON favorites (asset);

-- ================================
-- 链同步 / 对账
-- ================================
CREATE TABLE IF NOT EXISTS chain_events_dedup
(
    id         BIGSERIAL PRIMARY KEY,
    signature  TEXT      NOT NULL,
    slot       BIGINT    NOT NULL,
    log_index  INTEGER   NOT NULL,
    event_name TEXT      NOT NULL,
    created_at BIGINT    NOT NULL,
    UNIQUE (signature, log_index)
);

CREATE INDEX IF NOT EXISTS idx_chain_events_slot ON chain_events_dedup (slot DESC);

CREATE TABLE IF NOT EXISTS chain_event_cursors
(
    key        TEXT PRIMARY KEY,
    last_slot  BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reconcile_runs
(
    id                 BIGSERIAL PRIMARY KEY,
    started_at         BIGINT NOT NULL,
    finished_at        BIGINT,
    from_slot          BIGINT,
    to_slot            BIGINT,
    scanned_count      INTEGER NOT NULL DEFAULT 0,
    repaired_count     INTEGER NOT NULL DEFAULT 0,
    mismatch_count     INTEGER NOT NULL DEFAULT 0,
    status             TEXT    NOT NULL DEFAULT 'running',
    error_message      TEXT
);

-- ================================
-- 加密模板与私钥备份
-- ================================
CREATE TABLE IF NOT EXISTS encryption_templates
(
    version          VARCHAR(32) PRIMARY KEY,
    message_template TEXT        NOT NULL,
    kdf_name         VARCHAR(64) NOT NULL,
    kdf_params       JSONB       NOT NULL,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       BIGINT      NOT NULL,
    updated_at       BIGINT      NOT NULL
);

CREATE TABLE IF NOT EXISTS user_encryption_backups
(
    pubkey                VARCHAR(44) PRIMARY KEY REFERENCES users (pubkey) ON DELETE CASCADE,
    backup_version        VARCHAR(32) NOT NULL REFERENCES encryption_templates (version),
    encrypted_private_key TEXT        NOT NULL,
    nonce                 TEXT        NOT NULL,
    kdf_salt              TEXT        NOT NULL,
    kdf_params            JSONB       NOT NULL,
    created_at            BIGINT      NOT NULL,
    updated_at            BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_encryption_templates_active ON encryption_templates (is_active);

-- ================================
-- 订单收货地址密文 / 物流密文（无明文地址表）
-- ================================
CREATE TABLE IF NOT EXISTS escrow_shipping_ciphertexts
(
    escrow_pda              VARCHAR(44) PRIMARY KEY REFERENCES escrows (escrow_pda) ON DELETE CASCADE,
    buyer_pubkey            VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    seller_pubkey           VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    seller_ciphertext       TEXT        NOT NULL,
    seller_nonce            TEXT        NOT NULL,
    seller_alg              VARCHAR(64) NOT NULL,
    buyer_ciphertext        TEXT,
    buyer_nonce             TEXT,
    buyer_alg               VARCHAR(64),
    encryption_key_version  VARCHAR(32) NOT NULL,
    created_at              BIGINT      NOT NULL,
    updated_at              BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escrow_shipping_ciphertexts_buyer
    ON escrow_shipping_ciphertexts (buyer_pubkey);

CREATE INDEX IF NOT EXISTS idx_escrow_shipping_ciphertexts_seller
    ON escrow_shipping_ciphertexts (seller_pubkey);

CREATE TABLE IF NOT EXISTS escrow_tracking_ciphertexts
(
    escrow_pda             VARCHAR(44) PRIMARY KEY REFERENCES escrows (escrow_pda) ON DELETE CASCADE,
    buyer_pubkey           VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    seller_pubkey          VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    seller_ciphertext      TEXT        NOT NULL,
    seller_nonce           TEXT        NOT NULL,
    seller_alg             VARCHAR(32) NOT NULL,
    buyer_ciphertext       TEXT,
    buyer_nonce            TEXT,
    buyer_alg              VARCHAR(32),
    encryption_key_version VARCHAR(32) NOT NULL,
    created_at             BIGINT      NOT NULL,
    updated_at             BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escrow_tracking_ciphertexts_buyer
    ON escrow_tracking_ciphertexts (buyer_pubkey);

CREATE INDEX IF NOT EXISTS idx_escrow_tracking_ciphertexts_seller
    ON escrow_tracking_ciphertexts (seller_pubkey);

CREATE TABLE IF NOT EXISTS user_shipping_ciphertexts
(
    id                      BIGSERIAL PRIMARY KEY,
    user_pubkey             VARCHAR(44) NOT NULL REFERENCES users (pubkey) ON DELETE CASCADE,
    buyer_ciphertext        TEXT        NOT NULL,
    buyer_nonce             TEXT        NOT NULL,
    buyer_alg               VARCHAR(64) NOT NULL,
    encryption_key_version  VARCHAR(32) NOT NULL,
    is_default              BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at              BIGINT      NOT NULL,
    updated_at              BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_shipping_ciphertexts_user
    ON user_shipping_ciphertexts (user_pubkey, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_shipping_ciphertexts_default
    ON user_shipping_ciphertexts (user_pubkey)
    WHERE is_default = TRUE;

-- ================================
-- 托管流水 / 书目事件（含 payload）
-- ================================
CREATE TABLE IF NOT EXISTS escrow_events
(
    id            BIGSERIAL PRIMARY KEY,
    escrow_pda    VARCHAR(44) NOT NULL REFERENCES escrows (escrow_pda) ON DELETE CASCADE,
    asset         VARCHAR(44) NOT NULL REFERENCES books (asset),
    seller        VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    buyer         VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    from_state    VARCHAR(20),
    to_state      VARCHAR(20) NOT NULL,
    action        VARCHAR(32) NOT NULL,
    tx_signature  VARCHAR(120),
    actor_pubkey  VARCHAR(44),
    created_at    BIGINT NOT NULL,
    payload       JSONB
);

CREATE INDEX IF NOT EXISTS idx_escrow_events_escrow_created
    ON escrow_events (escrow_pda, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escrow_events_asset_created
    ON escrow_events (asset, created_at DESC);

CREATE TABLE IF NOT EXISTS book_events
(
    id           BIGSERIAL PRIMARY KEY,
    asset        VARCHAR(44) NOT NULL REFERENCES books (asset) ON DELETE CASCADE,
    event_type   VARCHAR(40) NOT NULL,
    from_owner   VARCHAR(44),
    to_owner     VARCHAR(44),
    escrow_pda   VARCHAR(44) REFERENCES escrows (escrow_pda),
    tx_signature TEXT,
    actor_pubkey VARCHAR(44),
    payload      JSONB,
    created_at   BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_book_events_asset_created
    ON book_events (asset, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_book_events_escrow_created
    ON book_events (escrow_pda, created_at DESC)
    WHERE escrow_pda IS NOT NULL;

-- ================================
-- 仲裁材料（主键 escrow_pda + initiator）与修订历史
-- ================================
CREATE TABLE IF NOT EXISTS escrow_dispute_submissions
(
    escrow_pda              VARCHAR(44) NOT NULL
        REFERENCES escrows (escrow_pda) ON DELETE CASCADE,
    initiator               VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    public_text             TEXT        NOT NULL,
    public_attachment_urls  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    private_text            TEXT,
    created_at              BIGINT      NOT NULL,
    PRIMARY KEY (escrow_pda, initiator)
);

CREATE INDEX IF NOT EXISTS idx_escrow_dispute_submissions_initiator
    ON escrow_dispute_submissions (initiator);

COMMENT ON TABLE escrow_dispute_submissions IS '仲裁中买卖双方可各提交一行；公开对质，private_text 仅仲裁员接口返回';

CREATE TABLE IF NOT EXISTS escrow_dispute_submission_revisions
(
    id BIGSERIAL PRIMARY KEY,
    escrow_pda VARCHAR(44) NOT NULL REFERENCES escrows (escrow_pda) ON DELETE CASCADE,
    initiator VARCHAR(44) NOT NULL,
    public_text TEXT NOT NULL,
    public_attachment_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    private_text TEXT,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edsr_escrow_created
    ON escrow_dispute_submission_revisions (escrow_pda, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_edsr_escrow_initiator
    ON escrow_dispute_submission_revisions (escrow_pda, initiator, created_at ASC);

COMMENT ON TABLE escrow_dispute_submission_revisions IS '仲裁材料每次保存追加一行；主表 escrow_dispute_submissions 仍为当前版本';

-- =============================================================================
-- 以下为「仅在有历史数据时才有意义」的幂等数据修补（新空库可省略，保留无害）
-- =============================================================================

-- 历史已完结订单视为已计入 trade_count（与 0013 一致）
UPDATE escrows
SET trade_count_applied = TRUE
WHERE state = 'Released';

-- 为已有 books 补 book_created 事件（与 0016 一致）
INSERT INTO book_events
(
    asset,
    event_type,
    from_owner,
    to_owner,
    escrow_pda,
    tx_signature,
    actor_pubkey,
    payload,
    created_at
)
SELECT
    b.asset,
    'book_created',
    NULL,
    COALESCE(
        (
            SELECT e.seller
            FROM escrows e
            WHERE e.asset = b.asset
            ORDER BY e.created_at ASC
            LIMIT 1
        ),
        b.seller
    ) AS creator,
    NULL,
    NULL,
    COALESCE(
        (
            SELECT e.seller
            FROM escrows e
            WHERE e.asset = b.asset
            ORDER BY e.created_at ASC
            LIMIT 1
        ),
        b.seller
    ) AS actor_pubkey,
    '{"backfilled": true}'::jsonb,
    b.created_at
FROM books b
WHERE NOT EXISTS (
    SELECT 1
    FROM book_events be
    WHERE be.asset = b.asset
      AND be.event_type = 'book_created'
);

-- 已有仲裁材料时补第一条修订记录（与 0023 一致）
INSERT INTO escrow_dispute_submission_revisions (escrow_pda, initiator, public_text, public_attachment_urls, private_text, created_at)
SELECT escrow_pda, initiator, public_text, public_attachment_urls, private_text, created_at
FROM escrow_dispute_submissions eds
WHERE NOT EXISTS (
    SELECT 1 FROM escrow_dispute_submission_revisions r
    WHERE r.escrow_pda = eds.escrow_pda AND r.initiator = eds.initiator
);
