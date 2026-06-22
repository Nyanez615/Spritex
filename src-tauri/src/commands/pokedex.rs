use crate::db::AppState;
use crate::models::{Pokemon, PokedexFilters};
use rusqlite::Row;
use tauri::State;

fn row_to_pokemon(row: &Row) -> rusqlite::Result<Pokemon> {
    Ok(Pokemon {
        id: row.get("id")?,
        name: row.get("name")?,
        display_name: row.get("display_name")?,
        form_id: row.get("form_id")?,
        form_name: row.get("form_name")?,
        generation: row.get("generation")?,
        sprite_url: row.get("sprite_url")?,
        shiny_sprite_url: row.get("shiny_sprite_url")?,
        types: row.get("types")?,
        gender_rate: row.get("gender_rate")?,
        is_mythical: row.get::<_, i32>("is_mythical")? != 0,
        is_legendary: row.get::<_, i32>("is_legendary")? != 0,
    })
}

#[tauri::command]
pub fn get_pokemon_list(
    state: State<'_, AppState>,
    filters: PokedexFilters,
) -> Result<Vec<Pokemon>, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;

    // Fixed-shape query — always exactly 3 placeholders, always exactly 3
    // bound values. The previous version built the SQL string conditionally
    // (skipping a placeholder when a filter was absent) but always bound 2
    // values regardless, which is exactly the "Wrong number of parameters"
    // mismatch this caused. NULL-coalescing in SQL avoids that whole class
    // of bug instead of trying to keep two independent constructions in sync.
    let mut stmt = conn
        .prepare(
            "SELECT * FROM pokemon \
             WHERE (?1 IS NULL OR name LIKE '%' || ?1 || '%') \
             AND (?2 IS NULL OR generation = ?2) \
             AND (?3 = 0 OR is_legendary = 1 OR is_mythical = 1) \
             ORDER BY id, form_id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(
            rusqlite::params![
                filters.search,
                filters.generation,
                filters.legendary_or_mythical_only.unwrap_or(false) as i32
            ],
            row_to_pokemon,
        )
        .map_err(|e| e.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_pokemon_detail(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
) -> Result<Pokemon, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT * FROM pokemon WHERE id = ?1 AND form_id = ?2",
        rusqlite::params![pokemon_id, form_id],
        row_to_pokemon,
    )
    .map_err(|e| e.to_string())
}

/// Backs the global command palette (⌘K) — case-insensitive substring match
/// on name/display_name, capped to keep palette results snappy.
#[tauri::command]
pub fn search_pokemon(state: State<'_, AppState>, query: String) -> Result<Vec<Pokemon>, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT * FROM pokemon \
             WHERE name LIKE '%' || ?1 || '%' OR display_name LIKE '%' || ?1 || '%' \
             ORDER BY id, form_id LIMIT 25",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![query], row_to_pokemon)
        .map_err(|e| e.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}
