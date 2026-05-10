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
    created_at    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escrow_events_escrow_created
    ON escrow_events (escrow_pda, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escrow_events_asset_created
    ON escrow_events (asset, created_at DESC);
