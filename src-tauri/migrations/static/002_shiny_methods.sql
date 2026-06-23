CREATE TABLE shiny_methods (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    pokemon_id          INTEGER NOT NULL,
    form_id             INTEGER NOT NULL DEFAULT 0,
    game                TEXT    NOT NULL,
    method              TEXT    NOT NULL,
    odds_base           INTEGER NOT NULL,
    odds_charm          INTEGER NOT NULL,
    odds_optimized      INTEGER NOT NULL,
    boost_requirements  TEXT    NOT NULL,
    is_best_method      INTEGER NOT NULL DEFAULT 0,
    is_wild_encounter   INTEGER NOT NULL DEFAULT 1,
    requires_transfer   INTEGER NOT NULL DEFAULT 0,
    transfer_chain      TEXT,
    citation_url        TEXT    NOT NULL,
    notes               TEXT,
    FOREIGN KEY (pokemon_id, form_id) REFERENCES pokemon(id, form_id)
);

CREATE INDEX idx_shiny_methods_pokemon ON shiny_methods(pokemon_id, form_id);
CREATE INDEX idx_shiny_methods_game ON shiny_methods(game);
CREATE INDEX idx_shiny_methods_best ON shiny_methods(is_best_method);
