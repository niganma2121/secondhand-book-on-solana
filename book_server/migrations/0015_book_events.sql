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
