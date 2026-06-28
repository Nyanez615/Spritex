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
