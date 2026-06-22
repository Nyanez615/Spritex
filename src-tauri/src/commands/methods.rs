use crate::db::AppState;
use crate::models::{Game, Method, ShinyMethod};
use rusqlite::Row;
use std::str::FromStr;
use tauri::State;

fn row_to_shiny_method(row: &Row) -> rusqlite::Result<ShinyMethod> {
    let game_str: String = row.get("game")?;
    let method_str: String = row.get("method")?;
    Ok(ShinyMethod {
        id: row.get("id")?,
        pokemon_id: row.get("pokemon_id")?,
        form_id: row.get("form_id")?,
        game: Game::from_str(&game_str).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, e.into())
        })?,
        method: Method::from_str(&method_str).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, e.into())
        })?,
        odds_base: row.get("odds_base")?,
        odds_charm: row.get("odds_charm")?,
        odds_optimized: row.get("odds_optimized")?,
        boost_requirements: row.get("boost_requirements")?,
        is_best_method: row.get::<_, i32>("is_best_method")? != 0,
        requires_transfer: row.get::<_, i32>("requires_transfer")? != 0,
        transfer_chain: row.get("transfer_chain")?,
        citation_url: row.get("citation_url")?,
        notes: row.get("notes")?,
    })
}

/// Every shiny_methods row for a species, sorted best→worst by odds_optimized
/// (lower denominator = better odds). Renders the full comparison, not just
/// the flagged best — the detail view makes the recommendation visual via
/// OddsComparisonChart rather than relying solely on `is_best_method`.
#[tauri::command]
pub fn get_methods_for_pokemon(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
) -> Result<Vec<ShinyMethod>, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT * FROM shiny_methods WHERE pokemon_id = ?1 AND form_id = ?2 \
             ORDER BY odds_optimized ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![pokemon_id, form_id], row_to_shiny_method)
        .map_err(|e| e.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

/// Backs "browse by game" — every species huntable in the given game.
#[tauri::command]
pub fn get_methods_for_game(state: State<'_, AppState>, game: Game) -> Result<Vec<ShinyMethod>, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT * FROM shiny_methods WHERE game = ?1 ORDER BY pokemon_id, form_id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![game.as_str()], row_to_shiny_method)
        .map_err(|e| e.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

/// Convenience lookup for the grid/table's best-odds pill.
#[tauri::command]
pub fn get_best_method(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
) -> Result<Option<ShinyMethod>, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT * FROM shiny_methods WHERE pokemon_id = ?1 AND form_id = ?2 \
         AND is_best_method = 1 LIMIT 1",
        rusqlite::params![pokemon_id, form_id],
        row_to_shiny_method,
    );

    match result {
        Ok(method) => Ok(Some(method)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
