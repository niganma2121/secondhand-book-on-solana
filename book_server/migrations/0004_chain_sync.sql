-- 链上事件幂等去重（signature + log_index）
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

-- 监听游标（断点续跑）
CREATE TABLE IF NOT EXISTS chain_event_cursors
(
    key        TEXT PRIMARY KEY,
    last_slot  BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- 对账任务运行记录
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
