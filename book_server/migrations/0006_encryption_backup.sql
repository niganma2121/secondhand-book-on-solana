-- 加密模板版本表：用于管理签名文案/KDF 参数版本
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

-- 用户通讯私钥备份（密文）表：只存密文，不存明文私钥
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
