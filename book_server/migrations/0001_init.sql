
-- ================================
-- 扩展
-- ================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ================================
-- 用户
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

COMMENT ON TABLE users IS '平台用户；主键为 Solana 钱包公钥（Base58）';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)
    WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_enc_pubkey_not_null
    ON users (pubkey)
    WHERE enc_pubkey IS NOT NULL;

COMMENT ON COLUMN users.reputation_score IS '信誉分 0–100，默认 100；仲裁裁决等事件增减';
COMMENT ON COLUMN users.dispute_total IS '参与并已结案的仲裁次数（买卖双方各计一次参与）';
COMMENT ON COLUMN users.dispute_won IS '仲裁胜诉次数';
COMMENT ON COLUMN users.dispute_lost IS '仲裁败诉次数';
COMMENT ON COLUMN users.enc_pubkey IS '端到端加密用公钥（站点托管私钥备份时与 encryption 表配合）';

-- ================================
-- 书籍分类 / 品相字典
-- ================================
CREATE TABLE IF NOT EXISTS book_categories
(
    key        VARCHAR(50) PRIMARY KEY,
    label_zh   VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

COMMENT ON TABLE book_categories IS '上架/筛选用书目分类字典；books.category 存 key，展示用 label_zh';


INSERT INTO book_categories (key, label_zh, sort_order)
VALUES ('math', '数学', 10),
       ('english', '英语', 20),
       ('computer', '计算机', 30),
       ('physics', '物理', 40),
       ('chemistry', '化学', 50),
       ('biology', '生物', 60),
       ('politics', '思想政治', 70),
       ('economics_mgmt', '经管', 80),
       ('law', '法学', 90),
       ('literature', '文学·语文', 100),
       ('history', '历史', 110),
       ('engineering', '工学', 120),
       ('medicine', '医学', 130),
       ('arts', '艺术', 140),
       ('agriculture', '农学', 150),
       ('education', '教育学', 160),
       ('philosophy', '哲学', 170),
       ('exam_prep', '考研·考证', 180),
       ('leisure', '课外读物', 190),
       ('other', '其他', 999)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS book_conditions
(
    key             VARCHAR(50) PRIMARY KEY,
    label_zh        VARCHAR(100) NOT NULL,
    description_zh  TEXT,
    sort_order      INT NOT NULL DEFAULT 0
);

COMMENT ON TABLE book_conditions IS '书籍品相字典；books.condition 存英文 key（New/LikeNew/…）';

INSERT INTO book_conditions (key, label_zh, description_zh, sort_order)
VALUES ('New', '全新', '未使用，无任何痕迹', 10),
       ('LikeNew', '近全新', '轻微使用，几乎无痕迹', 20),
       ('Good', '良好', '正常翻阅痕迹，无破损', 30),
       ('Fair', '一般', '有笔记或折角，不影响阅读', 40),
       ('Poor', '较差', '明显破损，仍可阅读', 50)
ON CONFLICT (key) DO NOTHING;

-- ================================
-- 书籍（链上 NFT 镜像）
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

COMMENT ON TABLE books IS '在售书目；asset 为链上 Token 地址，与托管/收藏关联';

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
-- 书籍图片
-- ================================
CREATE TABLE IF NOT EXISTS book_images
(
    id         BIGINT      PRIMARY KEY,
    asset      VARCHAR(44) NOT NULL REFERENCES books (asset) ON DELETE CASCADE,
    url        TEXT        NOT NULL,
    sort       SMALLINT    NOT NULL DEFAULT 0,
    created_at BIGINT      NOT NULL
);

COMMENT ON TABLE book_images IS '书籍封面与附图 URL；按 sort 排序展示';

CREATE INDEX IF NOT EXISTS idx_book_images_asset ON book_images (asset);

-- ================================
-- 交易托管（链上 Escrow 镜像）
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

COMMENT ON TABLE escrows IS '单笔买卖托管订单；状态与链上 Escrow 账户同步';

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
COMMENT ON COLUMN escrows.disputed_at IS '进入仲裁（Disputed）时的 Unix 时间戳（秒）；对账或链上争议时写入，更新仲裁材料不修改本字段';
COMMENT ON COLUMN escrows.shipping_commitment IS '链上收货承诺哈希等；与明文地址密文表配合';
COMMENT ON COLUMN escrows.cancelled_by IS '取消操作发起方公钥（若已取消）';

-- ================================
-- 交易评价
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

COMMENT ON TABLE reviews IS '托管完成后买卖双方互评；每单每方最多一条';

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews (reviewee);

-- ================================
-- 站内私信
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

COMMENT ON TABLE messages IS '用户间聊天消息；content 为结构化 JSON（文本等）';

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (
    LEAST(from_pubkey, to_pubkey),
    GREATEST(from_pubkey, to_pubkey),
    id
);

CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (to_pubkey, id)
    WHERE is_read = FALSE;

-- ================================
-- 收藏
-- ================================
CREATE TABLE IF NOT EXISTS favorites
(
    user_pubkey VARCHAR(44) NOT NULL REFERENCES users (pubkey),
    asset       VARCHAR(44) NOT NULL REFERENCES books (asset),
    created_at  BIGINT      NOT NULL,
    PRIMARY KEY (user_pubkey, asset)
);

COMMENT ON TABLE favorites IS '用户收藏的书籍（asset）';

CREATE INDEX IF NOT EXISTS idx_favorites_asset ON favorites (asset);

-- ================================
-- 链上事件去重与对账
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

COMMENT ON TABLE chain_events_dedup IS '已处理的链上日志事件去重表，防止重复消费';

CREATE INDEX IF NOT EXISTS idx_chain_events_slot ON chain_events_dedup (slot DESC);

CREATE TABLE IF NOT EXISTS chain_event_cursors
(
    key        TEXT PRIMARY KEY,
    last_slot  BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

COMMENT ON TABLE chain_event_cursors IS '链上监听/同步游标（按 key 区分订阅流）';

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

COMMENT ON TABLE reconcile_runs IS '链与库对账任务运行记录';

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

COMMENT ON TABLE encryption_templates IS '钱包私钥备份加密方案版本（KDF、签名消息模板等）';

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

COMMENT ON TABLE user_encryption_backups IS '用户加密托管的钱包私钥备份（密文）';

CREATE INDEX IF NOT EXISTS idx_encryption_templates_active ON encryption_templates (is_active);

-- ================================
-- 收货地址 / 物流单号密文（无明文地址表）
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

COMMENT ON TABLE escrow_shipping_ciphertexts IS '订单收货地址密文；买卖双方各一份可解密副本';

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

COMMENT ON TABLE escrow_tracking_ciphertexts IS '订单物流单号密文；结构同收货地址密文表';

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

COMMENT ON TABLE user_shipping_ciphertexts IS '用户保存的常用收货地址密文（下单时可选）';

CREATE INDEX IF NOT EXISTS idx_user_shipping_ciphertexts_user
    ON user_shipping_ciphertexts (user_pubkey, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_shipping_ciphertexts_default
    ON user_shipping_ciphertexts (user_pubkey)
    WHERE is_default = TRUE;

-- ================================
-- 托管状态流水 / 书目生命周期事件
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

COMMENT ON TABLE escrow_events IS '托管订单状态变更与操作审计流水';

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

COMMENT ON TABLE book_events IS '书籍生命周期事件（上架、成交、争议等），用于公开展示与追溯';

CREATE INDEX IF NOT EXISTS idx_book_events_asset_created
    ON book_events (asset, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_book_events_escrow_created
    ON book_events (escrow_pda, created_at DESC)
    WHERE escrow_pda IS NOT NULL;

-- ================================
-- 仲裁材料与修订历史
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

COMMENT ON TABLE escrow_dispute_submissions IS '仲裁当前材料：买卖双方各一行；公开栏对质，private_text 仅仲裁员可见';

CREATE INDEX IF NOT EXISTS idx_escrow_dispute_submissions_initiator
    ON escrow_dispute_submissions (initiator);

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

COMMENT ON TABLE escrow_dispute_submission_revisions IS '仲裁材料每次保存的历史版本；主表保留最新一份';

CREATE INDEX IF NOT EXISTS idx_edsr_escrow_created
    ON escrow_dispute_submission_revisions (escrow_pda, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_edsr_escrow_initiator
    ON escrow_dispute_submission_revisions (escrow_pda, initiator, created_at ASC);
