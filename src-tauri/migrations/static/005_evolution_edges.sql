-- Real "evolves into" relationships within an evolution chain, derived from
-- PokéAPI's evolution-chain tree (tools/seed-gen/src/fetchEvolutionChains.ts).
-- evolution_chains alone only knows a member's stage, not which specific
-- earlier-stage member it evolves FROM — insufficient to distinguish two
-- parallel same-depth lines (Rattata->Raticate vs. Alolan Rattata->Alolan
-- Raticate) from a single member branching into several (Gloom->Vileplume
-- and Gloom->Bellossom). The frontend's evolution-line chip row uses this
-- table to render each real lineage as its own row instead of one flat,
-- misleadingly linear-looking list of every member at every stage.
CREATE TABLE evolution_edges (
    chain_id       INTEGER NOT NULL,
    from_pokemon_id INTEGER NOT NULL,
    from_form_id   INTEGER NOT NULL DEFAULT 0,
    to_pokemon_id  INTEGER NOT NULL,
    to_form_id     INTEGER NOT NULL DEFAULT 0,
    -- The specific cosmetic_forms `kind` the FROM individual must currently
    -- be displaying for this edge to be this precise — NULL (true for the
    -- overwhelming majority of edges) means no specific cosmetic form is
    -- required. Burmy (#412) is the only confirmed case: its cloak is
    -- purely cosmetic (no stat/type difference), but Bulbapedia is explicit
    -- that the cloak deterministically locks in which Wormadam cloak
    -- results ("its form determines the form of Wormadam it evolves into,
    -- which is permanent") — purely a frontend labeling hint (e.g. show
    -- "Sandy Burmy" instead of generic "Burmy" in the lane leading to Sandy
    -- Wormadam), since every edge here is already a real, independently
    -- reachable outcome regardless of this column.
    from_cosmetic_kind TEXT,
    PRIMARY KEY (from_pokemon_id, from_form_id, to_pokemon_id, to_form_id),
    FOREIGN KEY (from_pokemon_id, from_form_id) REFERENCES pokemon(id, form_id),
    FOREIGN KEY (to_pokemon_id, to_form_id) REFERENCES pokemon(id, form_id)
);

CREATE INDEX idx_evolution_edges_chain ON evolution_edges(chain_id);
