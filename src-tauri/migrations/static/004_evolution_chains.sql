-- Per-(pokemon_id, form_id) evolution-chain membership, derived from PokéAPI's
-- evolution-chain tree (see tools/seed-gen/src/fetchEvolutionChains.ts). One
-- row per form post-dedup — unlike cosmetic_forms, a base form never has more
-- than one chain membership, so a composite primary key is correct here.
CREATE TABLE evolution_chains (
    pokemon_id INTEGER NOT NULL,
    form_id    INTEGER NOT NULL DEFAULT 0,
    chain_id   INTEGER NOT NULL,
    stage      INTEGER NOT NULL,
    PRIMARY KEY (pokemon_id, form_id),
    FOREIGN KEY (pokemon_id, form_id) REFERENCES pokemon(id, form_id)
);

CREATE INDEX idx_evolution_chains_chain ON evolution_chains(chain_id, stage);
