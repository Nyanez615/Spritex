/**
 * Final pipeline stage: applies migrations/static/*.sql to a fresh database
 * and bulk-inserts the derived pokemon/shiny_methods rows, replacing
 * src-tauri/resources/static.db. Builds into a temp file first and renames
 * over the real path atomically, so a crash mid-write never leaves the
 * bundled resource truncated.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readOutJson } from "./httpCache.js";
import type { CosmeticFormRow, EvolutionChainRow, EvolutionEdgeRow, PokemonRow, ShinyMethodRow } from "./deriveShinyMethods.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..", "..", "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "src-tauri", "migrations", "static");
const TARGET_DB = path.join(REPO_ROOT, "src-tauri", "resources", "static.db");

function b(value: boolean): number {
  return value ? 1 : 0;
}

async function applyMigrations(db: DatabaseSync): Promise<void> {
  for (const file of ["001_pokemon.sql", "002_shiny_methods.sql", "003_cosmetic_forms.sql", "004_evolution_chains.sql", "005_evolution_edges.sql"]) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    db.exec(sql);
  }
}

function insertPokemon(db: DatabaseSync, rows: PokemonRow[]): void {
  const stmt = db.prepare(`
    INSERT INTO pokemon (
      id, name, display_name, form_id, form_name, generation, sprite_url, shiny_sprite_url,
      sprite_url_female, shiny_sprite_url_female, types, gender_rate, is_mythical, is_legendary,
      is_baby, is_final_evolution, color, shape, growth_rate, egg_groups, capture_rate,
      base_happiness, height, weight, abilities, stat_hp, stat_attack, stat_defense,
      stat_special_attack, stat_special_defense, stat_speed, stat_total, base_experience,
      ev_yield_hp, ev_yield_attack, ev_yield_defense, ev_yield_special_attack,
      ev_yield_special_defense, ev_yield_speed, has_mega_evolution, has_gigantamax,
      has_gender_differences, hatch_steps, flavor_text
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      r.id, r.name, r.display_name, r.form_id, r.form_name, r.generation,
      r.sprite_url, r.shiny_sprite_url, r.sprite_url_female, r.shiny_sprite_url_female,
      r.types, r.gender_rate, b(r.is_mythical), b(r.is_legendary), b(r.is_baby), b(r.is_final_evolution),
      r.color, r.shape, r.growth_rate, r.egg_groups, r.capture_rate, r.base_happiness,
      r.height, r.weight, r.abilities, r.stat_hp, r.stat_attack, r.stat_defense,
      r.stat_special_attack, r.stat_special_defense, r.stat_speed, r.stat_total, r.base_experience,
      r.ev_yield_hp, r.ev_yield_attack, r.ev_yield_defense, r.ev_yield_special_attack,
      r.ev_yield_special_defense, r.ev_yield_speed, b(r.has_mega_evolution), b(r.has_gigantamax),
      b(r.has_gender_differences), r.hatch_steps, r.flavor_text
    );
  }
}

function insertShinyMethods(db: DatabaseSync, rows: ShinyMethodRow[]): void {
  const stmt = db.prepare(`
    INSERT INTO shiny_methods (pokemon_id, form_id, game, method, odds_base, odds_charm, odds_optimized, boost_requirements, is_best_method, is_wild_encounter, acquisition_method, requires_transfer, transfer_chain, citation_url, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      r.pokemon_id, r.form_id, r.game, r.method, r.odds_base, r.odds_charm, r.odds_optimized,
      r.boost_requirements, b(r.is_best_method), b(r.is_wild_encounter), r.acquisition_method, b(r.requires_transfer), r.transfer_chain, r.citation_url, r.notes
    );
  }
}

function insertCosmeticForms(db: DatabaseSync, rows: CosmeticFormRow[]): void {
  const stmt = db.prepare(`
    INSERT INTO cosmetic_forms (
      pokemon_id, form_id, kind, display_name, sprite_url, shiny_sprite_url, mega_stone_item,
      types, height, weight, abilities, stat_hp, stat_attack, stat_defense, stat_special_attack,
      stat_special_defense, stat_speed, stat_total, base_experience, ev_yield_hp, ev_yield_attack,
      ev_yield_defense, ev_yield_special_attack, ev_yield_special_defense, ev_yield_speed
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      r.pokemon_id, r.form_id, r.kind, r.display_name, r.sprite_url, r.shiny_sprite_url, r.mega_stone_item,
      r.types, r.height, r.weight, r.abilities, r.stat_hp, r.stat_attack, r.stat_defense, r.stat_special_attack,
      r.stat_special_defense, r.stat_speed, r.stat_total, r.base_experience, r.ev_yield_hp, r.ev_yield_attack,
      r.ev_yield_defense, r.ev_yield_special_attack, r.ev_yield_special_defense, r.ev_yield_speed
    );
  }
}

function insertEvolutionChains(db: DatabaseSync, rows: EvolutionChainRow[]): void {
  const stmt = db.prepare(`
    INSERT INTO evolution_chains (pokemon_id, form_id, chain_id, stage)
    VALUES (?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(r.pokemon_id, r.form_id, r.chain_id, r.stage);
  }
}

function insertEvolutionEdges(db: DatabaseSync, rows: EvolutionEdgeRow[]): void {
  const stmt = db.prepare(`
    INSERT INTO evolution_edges (chain_id, from_pokemon_id, from_form_id, to_pokemon_id, to_form_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(r.chain_id, r.from_pokemon_id, r.from_form_id, r.to_pokemon_id, r.to_form_id);
  }
}

export async function runBuildStaticDb(): Promise<void> {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const shinyMethods = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const cosmeticForms = await readOutJson<CosmeticFormRow[]>("cosmetic-forms.json");
  const evolutionChains = await readOutJson<EvolutionChainRow[]>("evolution-chains.json");
  const evolutionEdges = await readOutJson<EvolutionEdgeRow[]>("evolution-edges.json");

  // Built in a sibling dir of the real target (not os.tmpdir()) so the final
  // rename() is an atomic same-filesystem move, not a cross-volume copy.
  const tmpDir = await mkdtemp(path.join(path.dirname(TARGET_DB), ".static-db-build-"));
  const tmpDb = path.join(tmpDir, "static.db");

  try {
    const db = new DatabaseSync(tmpDb);
    try {
      await applyMigrations(db);
      db.exec("BEGIN TRANSACTION;");
      insertPokemon(db, pokemon);
      insertShinyMethods(db, shinyMethods);
      insertCosmeticForms(db, cosmeticForms);
      insertEvolutionChains(db, evolutionChains);
      insertEvolutionEdges(db, evolutionEdges);
      db.exec("COMMIT;");
    } finally {
      db.close();
    }
    await rename(tmpDb, TARGET_DB);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`buildStaticDb: wrote ${pokemon.length} pokemon + ${shinyMethods.length} shiny_methods + ${cosmeticForms.length} cosmetic_forms + ${evolutionChains.length} evolution_chains + ${evolutionEdges.length} evolution_edges rows to ${path.relative(REPO_ROOT, TARGET_DB)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuildStaticDb().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
