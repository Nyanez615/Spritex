#![cfg(test)]

//! Shared test-only helpers. Two kinds of database under test:
//! - `static_db` (rusqlite, read-only in production): seeded here via an
//!   in-memory connection running the *real* migrations/static/*.sql files
//!   (via include_str!, so the test schema can never silently drift from
//!   what tools/seed-gen/ actually builds).
//! - `sync_db` (libsql): libsql's local (non-replica, no Turso/network) mode
//!   supports a literal ":memory:" path — migrated via db.rs's own
//!   run_synced_migrations, the exact function the real open_synced() path
//!   uses, so test data goes through the identical migration logic.
//!
//! Neither helper touches `tauri::State` — it has no public constructor
//! outside Tauri's own IPC dispatch, so every command in commands/ is split
//! into a thin #[tauri::command] wrapper (unwraps State, delegates) plus a
//! plain-reference `_impl` function that's actually under test here.
//!
//! Considered `tauri`'s own `test` feature (`tauri::test::mock_builder()`/
//! `MockRuntime`, confirmed present in the resolved tauri 2.11.3 source) as
//! an alternative that would let the original `#[tauri::command]` functions
//! run unmodified. Rejected: every wrapper body here is a one-line
//! `require_sync_db` + delegate call, not logic worth testing through a full
//! mock `App`/`WebviewWindow` and serialized IPC round-trip — the `_impl`
//! split is far less ceremony per test for no coverage loss.

use rusqlite::Connection;
use std::sync::{Arc, Once};

static SQLITE_THREADING_INIT: Once = Once::new();

/// Must run before ANY SQLite-touching call (rusqlite or libsql) anywhere in
/// this test binary. libsql's own internal Once (inside its bundled
/// SQLite's `Database::new()`) calls `sqlite3_config(SQLITE_CONFIG_SERIALIZED)`,
/// which is only legal *before* SQLite's first-ever `sqlite3_open()` call in
/// the process — rusqlite's bundled SQLite initializes implicitly on its
/// first `open()` with no config call of its own, so if a rusqlite
/// connection opens even once before libsql's first connection, libsql's
/// config call permanently fails with SQLITE_MISUSE (confirmed empirically:
/// it panics, which poisons libsql's own Once for the rest of the process,
/// so every later libsql test in the same run fails too, even ones that
/// never touch rusqlite). Forcing a throwaway libsql open here, gated behind
/// our own Once and called first by every other helper in this module,
/// guarantees libsql always wins that race regardless of which test happens
/// to run first or how `cargo test` schedules/parallelizes them.
fn ensure_sqlite_threading_initialized() {
    SQLITE_THREADING_INIT.call_once(|| {
        // Spawn a dedicated OS thread for this one-time init rather than
        // building-and-blocking-on a runtime in place — building+block_on
        // panics ("Cannot start a runtime from within a runtime") when this
        // is called from inside an already-running #[tokio::test] runtime,
        // which every async caller here (local_synced_db) always is. A
        // fresh OS thread has no existing runtime to conflict with,
        // regardless of whether the caller is sync or async.
        std::thread::spawn(|| {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("build throwaway tokio runtime for SQLite threading init");
            rt.block_on(async {
                let _ = libsql::Builder::new_local(":memory:").build().await;
            });
        })
        .join()
        .expect("join SQLite threading init thread");
    });
}

// ── static_db (rusqlite) ────────────────────────────────────────────────────

/// A bare in-memory rusqlite connection, with no schema applied — for tests
/// that need an `AppState.static_db` placeholder but don't actually query it
/// (e.g. require_sync_db's error-path tests, which only care about sync_db).
pub fn bare_static_db() -> Connection {
    ensure_sqlite_threading_initialized();
    Connection::open_in_memory().expect("open in-memory static_db")
}

/// Deliberately sparse — only the columns the pokedex.rs/methods.rs tests
/// actually assert on are parameters; everything else gets a harmless
/// placeholder so the real, full-width row_to_pokemon mapper never errors.
pub struct TestPokemonRow {
    pub id: i32,
    pub form_id: i32,
    pub name: String,
    pub display_name: String,
    pub generation: i32,
    pub is_legendary: bool,
    pub is_mythical: bool,
}

impl Default for TestPokemonRow {
    fn default() -> Self {
        Self {
            id: 0,
            form_id: 0,
            name: String::new(),
            display_name: String::new(),
            generation: 1,
            is_legendary: false,
            is_mythical: false,
        }
    }
}

pub fn seed_static_db(rows: &[TestPokemonRow]) -> Connection {
    let conn = bare_static_db();
    conn.execute_batch(include_str!("../migrations/static/001_pokemon.sql"))
        .expect("apply 001_pokemon.sql");
    conn.execute_batch(include_str!("../migrations/static/002_shiny_methods.sql"))
        .expect("apply 002_shiny_methods.sql");
    conn.execute_batch(include_str!("../migrations/static/003_cosmetic_forms.sql"))
        .expect("apply 003_cosmetic_forms.sql");

    for row in rows {
        let display_name = if row.display_name.is_empty() { row.name.clone() } else { row.display_name.clone() };
        conn.execute(
            "INSERT INTO pokemon (
                id, form_id, name, display_name, generation, sprite_url, shiny_sprite_url, types,
                gender_rate, is_mythical, is_legendary, is_baby, is_final_evolution, color,
                growth_rate, egg_groups, capture_rate, base_happiness, height, weight, abilities,
                stat_hp, stat_attack, stat_defense, stat_special_attack, stat_special_defense, stat_speed, stat_total,
                base_experience, ev_yield_hp, ev_yield_attack, ev_yield_defense,
                ev_yield_special_attack, ev_yield_special_defense, ev_yield_speed,
                has_mega_evolution, has_gigantamax
            ) VALUES (?1, ?2, ?3, ?4, ?5, '', '', '[]', 1, ?6, ?7, 0, 0, '', '', '[]', 45, 70, 10, 100, '[]', 1, 1, 1, 1, 1, 1, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0)",
            rusqlite::params![
                row.id, row.form_id, row.name, display_name, row.generation,
                row.is_mythical as i32, row.is_legendary as i32,
            ],
        )
        .expect("insert test pokemon row");
    }

    conn
}

pub struct TestShinyMethodRow {
    pub pokemon_id: i32,
    pub form_id: i32,
    pub game: String,
    pub method: String,
    pub odds_optimized: i32,
    pub is_best_method: bool,
    pub is_wild_encounter: bool,
}

impl Default for TestShinyMethodRow {
    fn default() -> Self {
        Self {
            pokemon_id: 0,
            form_id: 0,
            game: String::new(),
            method: String::new(),
            odds_optimized: 0,
            is_best_method: false,
            is_wild_encounter: true,
        }
    }
}

pub fn seed_shiny_methods(conn: &Connection, rows: &[TestShinyMethodRow]) {
    for row in rows {
        conn.execute(
            "INSERT INTO shiny_methods (
                pokemon_id, form_id, game, method, odds_base, odds_charm, odds_optimized,
                boost_requirements, is_best_method, is_wild_encounter, requires_transfer, citation_url
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5, '[]', ?6, ?7, 0, '')",
            rusqlite::params![
                row.pokemon_id, row.form_id, row.game, row.method, row.odds_optimized,
                row.is_best_method as i32, row.is_wild_encounter as i32,
            ],
        )
        .expect("insert test shiny_methods row");
    }
}

#[derive(Default)]
pub struct TestCosmeticFormRow {
    pub pokemon_id: i32,
    pub form_id: i32,
    pub kind: String,
    pub display_name: String,
    pub mega_stone_item: Option<String>,
}

pub fn seed_cosmetic_forms(conn: &Connection, rows: &[TestCosmeticFormRow]) {
    for row in rows {
        conn.execute(
            "INSERT INTO cosmetic_forms (
                pokemon_id, form_id, kind, display_name, sprite_url, shiny_sprite_url, mega_stone_item,
                types, height, weight, abilities,
                stat_hp, stat_attack, stat_defense, stat_special_attack, stat_special_defense, stat_speed, stat_total,
                base_experience, ev_yield_hp, ev_yield_attack, ev_yield_defense,
                ev_yield_special_attack, ev_yield_special_defense, ev_yield_speed
            ) VALUES (?1, ?2, ?3, ?4, '', '', ?5, '[]', 0, 0, '[]', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)",
            rusqlite::params![
                row.pokemon_id, row.form_id, row.kind, row.display_name, row.mega_stone_item,
            ],
        )
        .expect("insert test cosmetic_forms row");
    }
}

// ── sync_db (libsql) ─────────────────────────────────────────────────────────

/// Returns the `Database` handle and `Connection` separately, same shape as
/// db.rs's `SyncedDb` — both are needed since `force_sync` calls `.sync()`
/// on the former while every other command queries through the latter. Each
/// call opens its own independent in-memory database with no shared mutable
/// state across tests — the only process-global hazard is the one-time
/// threading init `ensure_sqlite_threading_initialized()` already guards;
/// once that's past, libsql's local backend is `Send + Sync` and safe under
/// cargo test's default parallelism.
pub async fn local_synced_db() -> (Arc<libsql::Database>, libsql::Connection) {
    ensure_sqlite_threading_initialized();
    let db = libsql::Builder::new_local(":memory:")
        .build()
        .await
        .expect("open in-memory libsql db");
    let conn = db.connect().expect("connect to in-memory libsql db");
    crate::db::run_synced_migrations(&conn)
        .await
        .expect("apply synced migrations");
    (Arc::new(db), conn)
}
