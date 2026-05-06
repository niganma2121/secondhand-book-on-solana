-- 订单级收货地址密文（不上链明文）
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
