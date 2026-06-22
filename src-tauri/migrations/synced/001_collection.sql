CREATE TABLE collection (
    id               TEXT PRIMARY KEY,
    pokemon_id       INTEGER NOT NULL,
    form_id          INTEGER NOT NULL DEFAULT 0,
    status           TEXT    NOT NULL DEFAULT 'not_started',
    is_shiny         INTEGER NOT NULL DEFAULT 0,
    encounter_count  INTEGER NOT NULL DEFAULT 0,
    has_shiny_charm  INTEGER NOT NULL DEFAULT 0,
    sandwich_active  INTEGER NOT NULL DEFAULT 0,
    outbreak_active  INTEGER NOT NULL DEFAULT 0,
    chain_count      INTEGER NOT NULL DEFAULT 0,
    game_caught      TEXT,
    method_used      TEXT,
    caught_at        TEXT,
    notes            TEXT,
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    synced_at        TEXT,
    deleted_at       TEXT,
    UNIQUE (pokemon_id, form_id)
);

CREATE INDEX idx_collection_status ON collection(status);
CREATE INDEX idx_collection_updated ON collection(updated_at);
