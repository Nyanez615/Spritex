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
    PRIMARY KEY (from_pokemon_id, from_form_id, to_pokemon_id, to_form_id),
    FOREIGN KEY (from_pokemon_id, from_form_id) REFERENCES pokemon(id, form_id),
    FOREIGN KEY (to_pokemon_id, to_form_id) REFERENCES pokemon(id, form_id)
);

CREATE INDEX idx_evolution_edges_chain ON evolution_edges(chain_id);
