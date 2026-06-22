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
import type { PokemonRow, ShinyMethodRow } from "./deriveShinyMethods.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..", "..", "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "src-tauri", "migrations", "static");
const TARGET_DB = path.join(REPO_ROOT, "src-tauri", "resources", "static.db");

function b(value: boolean): number {
  return value ? 1 : 0;
}

async function applyMigrations(db: DatabaseSync): Promise<void> {
  for (const file of ["001_pokemon.sql", "002_shiny_methods.sql"]) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    db.exec(sql);
  }
}

function insertPokemon(db: DatabaseSync, rows: PokemonRow[]): void {
  const stmt = db.prepare(`
    INSERT INTO pokemon (id, name, display_name, form_id, form_name, generation, sprite_url, shiny_sprite_url, types, gender_rate, is_mythical, is_legendary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      r.id, r.name, r.display_name, r.form_id, r.form_name, r.generation,
      r.sprite_url, r.shiny_sprite_url, r.types, r.gender_rate, b(r.is_mythical), b(r.is_legendary)
    );
  }
}

function insertShinyMethods(db: DatabaseSync, rows: ShinyMethodRow[]): void {
  const stmt = db.prepare(`
    INSERT INTO shiny_methods (pokemon_id, form_id, game, method, odds_base, odds_charm, odds_optimized, boost_requirements, is_best_method, requires_transfer, transfer_chain, citation_url, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      r.pokemon_id, r.form_id, r.game, r.method, r.odds_base, r.odds_charm, r.odds_optimized,
      r.boost_requirements, b(r.is_best_method), b(r.requires_transfer), r.transfer_chain, r.citation_url, r.notes
    );
  }
}

export async function runBuildStaticDb(): Promise<void> {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const shinyMethods = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");

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
      db.exec("COMMIT;");
    } finally {
      db.close();
    }
    await rename(tmpDb, TARGET_DB);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`buildStaticDb: wrote ${pokemon.length} pokemon + ${shinyMethods.length} shiny_methods rows to ${path.relative(REPO_ROOT, TARGET_DB)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuildStaticDb().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
