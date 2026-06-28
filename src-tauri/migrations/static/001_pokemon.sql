CREATE TABLE pokemon (
    id                       INTEGER NOT NULL,
    name                     TEXT    NOT NULL,
    display_name             TEXT    NOT NULL,
    form_id                  INTEGER NOT NULL DEFAULT 0,
    form_name                TEXT,
    generation               INTEGER NOT NULL,
    sprite_url               TEXT    NOT NULL,
    shiny_sprite_url         TEXT    NOT NULL,
    sprite_url_female        TEXT,
    shiny_sprite_url_female  TEXT,
    -- The sprite's own non-transparent content region, as fractions (0..1)
    -- of its canvas — see cosmetic_forms' own sprite_crop_x doc comment for
    -- the full reasoning (PokéAPI's basic battle sprites are inconsistently
    -- padded across species, so a fixed CSS zoom can't safely fit every one
    -- without clipping some). Almost always a near-no-op for this table
    -- (sprite_url usually resolves to tightly-cropped official artwork via
    -- bestSprite()'s fallback chain), computed unconditionally anyway so any
    -- future species/variety that ever lacks official-artwork/home sprites
    -- gets the same fix automatically. _female fields are measured
    -- separately from sprite_url_female (a genuinely different sprite when
    -- has_gender_differences is true, not just a recolor); default to the
    -- full canvas when there's no gender-difference sprite to crop.
    sprite_crop_x            REAL    NOT NULL DEFAULT 0,
    sprite_crop_y            REAL    NOT NULL DEFAULT 0,
    sprite_crop_width        REAL    NOT NULL DEFAULT 1,
    sprite_crop_height       REAL    NOT NULL DEFAULT 1,
    sprite_crop_x_female      REAL    NOT NULL DEFAULT 0,
    sprite_crop_y_female      REAL    NOT NULL DEFAULT 0,
    sprite_crop_width_female  REAL    NOT NULL DEFAULT 1,
    sprite_crop_height_female REAL    NOT NULL DEFAULT 1,
    types                    TEXT    NOT NULL,
    gender_rate              INTEGER NOT NULL,
    is_mythical              INTEGER NOT NULL DEFAULT 0,
    is_legendary             INTEGER NOT NULL DEFAULT 0,
    is_baby                  INTEGER NOT NULL DEFAULT 0,
    is_final_evolution       INTEGER NOT NULL DEFAULT 0,
    color                    TEXT    NOT NULL,
    shape                    TEXT,
    growth_rate              TEXT    NOT NULL,
    egg_groups               TEXT    NOT NULL,
    capture_rate             INTEGER NOT NULL,
    base_happiness           INTEGER NOT NULL,
    height                   INTEGER NOT NULL,
    weight                   INTEGER NOT NULL,
    abilities                TEXT    NOT NULL,
    stat_hp                  INTEGER NOT NULL,
    stat_attack               INTEGER NOT NULL,
    stat_defense             INTEGER NOT NULL,
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
    has_mega_evolution        INTEGER NOT NULL DEFAULT 0,
    has_gigantamax            INTEGER NOT NULL DEFAULT 0,
    has_gender_differences    INTEGER NOT NULL DEFAULT 0,
    hatch_steps               INTEGER NOT NULL DEFAULT 0,
    flavor_text               TEXT,
    PRIMARY KEY (id, form_id)
);

CREATE INDEX idx_pokemon_generation ON pokemon(generation);
CREATE INDEX idx_pokemon_name ON pokemon(name);
