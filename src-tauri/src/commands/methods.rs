use crate::db::AppState;
use crate::models::{Game, Method, ShinyMethod};
use rusqlite::{Connection, Row};
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
    get_methods_for_pokemon_impl(&conn, pokemon_id, form_id)
}

fn get_methods_for_pokemon_impl(conn: &Connection, pokemon_id: i32, form_id: i32) -> Result<Vec<ShinyMethod>, String> {
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
    get_methods_for_game_impl(&conn, game)
}

fn get_methods_for_game_impl(conn: &Connection, game: Game) -> Result<Vec<ShinyMethod>, String> {
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
    get_best_method_impl(&conn, pokemon_id, form_id)
}

fn get_best_method_impl(conn: &Connection, pokemon_id: i32, form_id: i32) -> Result<Option<ShinyMethod>, String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{seed_shiny_methods, seed_static_db, TestPokemonRow, TestShinyMethodRow};

    fn method_row(pokemon_id: i32, game: &str, method: &str, odds: i32, best: bool) -> TestShinyMethodRow {
        TestShinyMethodRow { pokemon_id, form_id: 0, game: game.into(), method: method.into(), odds_optimized: odds, is_best_method: best }
    }

    #[test]
    fn get_methods_for_pokemon_sorts_best_to_worst_by_odds() {
        let conn = seed_static_db(&[TestPokemonRow { id: 1, ..Default::default() }]);
        seed_shiny_methods(&conn, &[
            method_row(1, "sv", "outbreak", 512, false),
            method_row(1, "bdsp", "chain_radar", 94, true),
            method_row(1, "gen6_xy", "wild", 4096, false),
        ]);

        let results = get_methods_for_pokemon_impl(&conn, 1, 0).unwrap();
        let odds: Vec<i32> = results.iter().map(|m| m.odds_optimized).collect();
        assert_eq!(odds, vec![94, 512, 4096], "expected ascending (best-first) order");
    }

    #[test]
    fn get_methods_for_game_filters_to_one_game_and_parses_the_game_enum() {
        let conn = seed_static_db(&[TestPokemonRow { id: 1, ..Default::default() }, TestPokemonRow { id: 2, ..Default::default() }]);
        seed_shiny_methods(&conn, &[
            method_row(1, "sv", "outbreak", 512, true),
            method_row(2, "bdsp", "chain_radar", 94, true),
        ]);

        let results = get_methods_for_game_impl(&conn, Game::Sv).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].pokemon_id, 1);
        assert_eq!(results[0].game, Game::Sv);
    }

    #[test]
    fn get_best_method_returns_none_when_no_row_is_flagged_best() {
        let conn = seed_static_db(&[TestPokemonRow { id: 1, ..Default::default() }]);
        seed_shiny_methods(&conn, &[method_row(1, "sv", "wild", 4096, false)]);

        assert!(get_best_method_impl(&conn, 1, 0).unwrap().is_none());
    }

    #[test]
    fn get_best_method_returns_the_flagged_row() {
        let conn = seed_static_db(&[TestPokemonRow { id: 1, ..Default::default() }]);
        seed_shiny_methods(&conn, &[
            method_row(1, "sv", "wild", 4096, false),
            method_row(1, "bdsp", "chain_radar", 94, true),
        ]);

        let best = get_best_method_impl(&conn, 1, 0).unwrap().unwrap();
        assert_eq!(best.game, Game::Bdsp);
        assert_eq!(best.odds_optimized, 94);
    }
}
