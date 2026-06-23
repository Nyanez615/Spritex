-- Mega Evolution / Gigantamax — cosmetic battle forms, not distinct dex
-- entries (Mega reverts after battle; Gmax doesn't change shininess), so
-- these are a sibling table keyed by the base pokemon row, not new rows in
-- `pokemon` itself.
CREATE TABLE cosmetic_forms (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    pokemon_id       INTEGER NOT NULL,
    form_id          INTEGER NOT NULL DEFAULT 0,
    kind             TEXT    NOT NULL,
    display_name     TEXT    NOT NULL,
    sprite_url       TEXT    NOT NULL,
    shiny_sprite_url TEXT    NOT NULL,
    mega_stone_item  TEXT,
    FOREIGN KEY (pokemon_id, form_id) REFERENCES pokemon(id, form_id)
);

CREATE INDEX idx_cosmetic_forms_pokemon ON cosmetic_forms(pokemon_id, form_id);
