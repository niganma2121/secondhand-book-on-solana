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
