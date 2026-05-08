CREATE TABLE IF NOT EXISTS user_shipping_addresses
(
    id              BIGSERIAL PRIMARY KEY,
    user_pubkey     VARCHAR(44) NOT NULL REFERENCES users (pubkey) ON DELETE CASCADE,
    label           VARCHAR(32) NOT NULL,
    recipient_name  VARCHAR(64) NOT NULL,
    phone           VARCHAR(11) NOT NULL CHECK (phone ~ '^[0-9]{11}$'),
    province_code   VARCHAR(6)  NOT NULL,
    city_code       VARCHAR(6)  NOT NULL,
    district_code   VARCHAR(6)  NOT NULL,
    region_text     TEXT        NOT NULL,
    detail          TEXT        NOT NULL,
    is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      BIGINT      NOT NULL,
    updated_at      BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_shipping_addresses_user
    ON user_shipping_addresses (user_pubkey, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_shipping_addresses_default
    ON user_shipping_addresses (user_pubkey)
    WHERE is_default = TRUE;
