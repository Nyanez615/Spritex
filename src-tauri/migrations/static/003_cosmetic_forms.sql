-- Every sprite-bearing alternate appearance that isn't a distinct dex entry
-- — both real-but-reverting battle states with their own stat block (Mega
-- Evolution/Gigantamax/Zen Mode/Minior's Core colors: Mega reverts after
-- battle, Gmax doesn't change shininess) AND purely decorative sprite
-- variants with NO stat difference at all from their parent row (Unown's
-- letters, Vivillon/Alcremie/Furfrou's patterns, Arceus/Silvally's
-- Plate/Memory types, Shellos/Gastrodon's East Sea, ...) — so this is a
-- sibling table keyed by the base pokemon row, not new rows in `pokemon`
-- itself, for both reasons: one because the state doesn't persist, the
-- other because there's nothing mechanical to even persist.
CREATE TABLE cosmetic_forms (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    pokemon_id                INTEGER NOT NULL,
    form_id                   INTEGER NOT NULL DEFAULT 0,
    kind                      TEXT    NOT NULL,
    display_name              TEXT    NOT NULL,
    sprite_url                TEXT    NOT NULL,
    shiny_sprite_url          TEXT    NOT NULL,
    -- The sprite's own non-transparent content region, as fractions (0..1)
    -- of its canvas — needed because PokéAPI `pokemon-form`-sourced sprites
    -- (every decorative-only cosmetic form: Unown's letters, Arceus's
    -- types, ...) only expose a small, heavily-padded basic battle sprite
    -- with no official-artwork/home variant, and how much padding varies
    -- wildly by species (confirmed live: Unown ~23%x33% filled, Arceus
    -- ~71%x76% filled) — too inconsistent for a single uniform CSS zoom to
    -- safely correct without clipping some sprites. shiny_sprite_url gets
    -- its OWN independently-measured crop, not reused from sprite_url's —
    -- a real, confirmed bug (Hisuian Lilligant) proved a shiny recolor's
    -- alpha shape can genuinely differ from its non-shiny counterpart's,
    -- not always a pure palette swap on the same shape.
    sprite_crop_x             REAL    NOT NULL DEFAULT 0,
    sprite_crop_y             REAL    NOT NULL DEFAULT 0,
    sprite_crop_width         REAL    NOT NULL DEFAULT 1,
    sprite_crop_height        REAL    NOT NULL DEFAULT 1,
    sprite_crop_x_shiny       REAL    NOT NULL DEFAULT 0,
    sprite_crop_y_shiny       REAL    NOT NULL DEFAULT 0,
    sprite_crop_width_shiny   REAL    NOT NULL DEFAULT 1,
    sprite_crop_height_shiny  REAL    NOT NULL DEFAULT 1,
    mega_stone_item           TEXT,
    types                     TEXT    NOT NULL,
    height                    INTEGER NOT NULL,
    weight                    INTEGER NOT NULL,
    abilities                 TEXT    NOT NULL,
    stat_hp                   INTEGER NOT NULL,
    stat_attack               INTEGER NOT NULL,
    stat_defense              INTEGER NOT NULL,
    stat_special_attack       INTEGER NOT NULL,
    stat_special_defense      INTEGER NOT NULL,
    stat_speed                INTEGER NOT NULL,
    stat_total                INTEGER NOT NULL,
    base_experience           INTEGER NOT NULL,
    ev_yield_hp               INTEGER NOT NULL,
    ev_yield_attack           INTEGER NOT NULL,
    ev_yield_defense          INTEGER NOT NULL,
    ev_yield_special_attack   INTEGER NOT NULL,
    ev_yield_special_defense  INTEGER NOT NULL,
    ev_yield_speed            INTEGER NOT NULL,
    FOREIGN KEY (pokemon_id, form_id) REFERENCES pokemon(id, form_id)
);

CREATE INDEX idx_cosmetic_forms_pokemon ON cosmetic_forms(pokemon_id, form_id);
