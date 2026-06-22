CREATE TABLE pokemon (
    id               INTEGER NOT NULL,
    name             TEXT    NOT NULL,
    display_name     TEXT    NOT NULL,
    form_id          INTEGER NOT NULL DEFAULT 0,
    form_name        TEXT,
    generation       INTEGER NOT NULL,
    sprite_url       TEXT    NOT NULL,
    shiny_sprite_url TEXT    NOT NULL,
    types            TEXT    NOT NULL,
    gender_rate      INTEGER NOT NULL,
    is_mythical      INTEGER NOT NULL DEFAULT 0,
    is_legendary     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, form_id)
);

CREATE INDEX idx_pokemon_generation ON pokemon(generation);
CREATE INDEX idx_pokemon_name ON pokemon(name);
