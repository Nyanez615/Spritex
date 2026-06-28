use crate::db::AppState;
use crate::models::{Pokemon, PokedexFilters};
use rusqlite::{Connection, Row};
use tauri::State;

pub(crate) fn row_to_pokemon(row: &Row) -> rusqlite::Result<Pokemon> {
    Ok(Pokemon {
        id: row.get("id")?,
        name: row.get("name")?,
        display_name: row.get("display_name")?,
        form_id: row.get("form_id")?,
        form_name: row.get("form_name")?,
        generation: row.get("generation")?,
        sprite_url: row.get("sprite_url")?,
        shiny_sprite_url: row.get("shiny_sprite_url")?,
        sprite_url_female: row.get("sprite_url_female")?,
        shiny_sprite_url_female: row.get("shiny_sprite_url_female")?,
        sprite_crop_x: row.get("sprite_crop_x")?,
        sprite_crop_y: row.get("sprite_crop_y")?,
        sprite_crop_width: row.get("sprite_crop_width")?,
        sprite_crop_height: row.get("sprite_crop_height")?,
        sprite_crop_x_shiny: row.get("sprite_crop_x_shiny")?,
        sprite_crop_y_shiny: row.get("sprite_crop_y_shiny")?,
        sprite_crop_width_shiny: row.get("sprite_crop_width_shiny")?,
        sprite_crop_height_shiny: row.get("sprite_crop_height_shiny")?,
        sprite_crop_x_female: row.get("sprite_crop_x_female")?,
        sprite_crop_y_female: row.get("sprite_crop_y_female")?,
        sprite_crop_width_female: row.get("sprite_crop_width_female")?,
        sprite_crop_height_female: row.get("sprite_crop_height_female")?,
        sprite_crop_x_shiny_female: row.get("sprite_crop_x_shiny_female")?,
        sprite_crop_y_shiny_female: row.get("sprite_crop_y_shiny_female")?,
        sprite_crop_width_shiny_female: row.get("sprite_crop_width_shiny_female")?,
        sprite_crop_height_shiny_female: row.get("sprite_crop_height_shiny_female")?,
        types: row.get("types")?,
        gender_rate: row.get("gender_rate")?,
        is_mythical: row.get::<_, i32>("is_mythical")? != 0,
        is_legendary: row.get::<_, i32>("is_legendary")? != 0,
        is_baby: row.get::<_, i32>("is_baby")? != 0,
        is_final_evolution: row.get::<_, i32>("is_final_evolution")? != 0,
        color: row.get("color")?,
        shape: row.get("shape")?,
        growth_rate: row.get("growth_rate")?,
        egg_groups: row.get("egg_groups")?,
        capture_rate: row.get("capture_rate")?,
        base_happiness: row.get("base_happiness")?,
        height: row.get("height")?,
        weight: row.get("weight")?,
        abilities: row.get("abilities")?,
        stat_hp: row.get("stat_hp")?,
        stat_attack: row.get("stat_attack")?,
        stat_defense: row.get("stat_defense")?,
        stat_special_attack: row.get("stat_special_attack")?,
        stat_special_defense: row.get("stat_special_defense")?,
        stat_speed: row.get("stat_speed")?,
        stat_total: row.get("stat_total")?,
        base_experience: row.get("base_experience")?,
        ev_yield_hp: row.get("ev_yield_hp")?,
        ev_yield_attack: row.get("ev_yield_attack")?,
        ev_yield_defense: row.get("ev_yield_defense")?,
        ev_yield_special_attack: row.get("ev_yield_special_attack")?,
        ev_yield_special_defense: row.get("ev_yield_special_defense")?,
        ev_yield_speed: row.get("ev_yield_speed")?,
        has_mega_evolution: row.get::<_, i32>("has_mega_evolution")? != 0,
        has_gigantamax: row.get::<_, i32>("has_gigantamax")? != 0,
        has_gender_differences: row.get::<_, i32>("has_gender_differences")? != 0,
        hatch_steps: row.get("hatch_steps")?,
        flavor_text: row.get("flavor_text")?,
    })
}

#[tauri::command]
pub fn get_pokemon_list(
    state: State<'_, AppState>,
    filters: PokedexFilters,
) -> Result<Vec<Pokemon>, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    get_pokemon_list_impl(&conn, &filters)
}

/// Separated from the #[tauri::command] wrapper above purely so it's
/// callable from tests without going through Tauri's State<T>, which has no
/// public constructor outside the framework's own IPC dispatch.
fn get_pokemon_list_impl(conn: &Connection, filters: &PokedexFilters) -> Result<Vec<Pokemon>, String> {
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
    get_pokemon_detail_impl(&conn, pokemon_id, form_id)
}

fn get_pokemon_detail_impl(conn: &Connection, pokemon_id: i32, form_id: i32) -> Result<Pokemon, String> {
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
    search_pokemon_impl(&conn, &query)
}

fn search_pokemon_impl(conn: &Connection, query: &str) -> Result<Vec<Pokemon>, String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::seed_static_db;

    fn pokemon_row(id: i32, name: &str, generation: i32, legendary: bool) -> crate::test_support::TestPokemonRow {
        crate::test_support::TestPokemonRow {
            id,
            name: name.to_string(),
            generation,
            is_legendary: legendary,
            ..Default::default()
        }
    }

    #[test]
    fn get_pokemon_list_filters_by_search_generation_and_rarity_independently() {
        let conn = seed_static_db(&[
            pokemon_row(1, "bulbasaur", 1, false),
            pokemon_row(150, "mewtwo", 1, true),
            pokemon_row(25, "pikachu", 1, false),
            pokemon_row(380, "latias", 3, true),
        ]);

        let all = get_pokemon_list_impl(&conn, &PokedexFilters { search: None, generation: None, legendary_or_mythical_only: None }).unwrap();
        assert_eq!(all.len(), 4);

        let by_search = get_pokemon_list_impl(&conn, &PokedexFilters { search: Some("pika".into()), generation: None, legendary_or_mythical_only: None }).unwrap();
        assert_eq!(by_search.len(), 1);
        assert_eq!(by_search[0].name, "pikachu");

        let by_gen = get_pokemon_list_impl(&conn, &PokedexFilters { search: None, generation: Some(3), legendary_or_mythical_only: None }).unwrap();
        assert_eq!(by_gen.len(), 1);
        assert_eq!(by_gen[0].name, "latias");

        let legendary_only = get_pokemon_list_impl(&conn, &PokedexFilters { search: None, generation: None, legendary_or_mythical_only: Some(true) }).unwrap();
        assert_eq!(legendary_only.len(), 2);
    }

    #[test]
    fn get_pokemon_detail_looks_up_by_id_and_form_id() {
        let conn = seed_static_db(&[pokemon_row(1, "bulbasaur", 1, false)]);
        let result = get_pokemon_detail_impl(&conn, 1, 0).unwrap();
        assert_eq!(result.name, "bulbasaur");
        assert!(get_pokemon_detail_impl(&conn, 999, 0).is_err());
    }

    #[test]
    fn search_pokemon_matches_name_case_insensitively_and_caps_at_25() {
        let rows: Vec<_> = (1..=30).map(|i| pokemon_row(i, &format!("species-{i}"), 1, false)).collect();
        let conn = seed_static_db(&rows);
        let results = search_pokemon_impl(&conn, "SPECIES").unwrap();
        assert_eq!(results.len(), 25, "expected the LIMIT 25 cap to apply");
    }

    #[test]
    fn get_pokemon_detail_defaults_sprite_crop_to_the_full_canvas_when_unset() {
        let conn = seed_static_db(&[pokemon_row(1, "bulbasaur", 1, false)]);
        let result = get_pokemon_detail_impl(&conn, 1, 0).unwrap();
        assert_eq!(result.sprite_crop_x, 0.0);
        assert_eq!(result.sprite_crop_y, 0.0);
        assert_eq!(result.sprite_crop_width, 1.0);
        assert_eq!(result.sprite_crop_height, 1.0);
        assert_eq!(result.sprite_crop_width_female, 1.0);
        assert_eq!(result.sprite_crop_height_female, 1.0);
    }

    #[test]
    fn get_pokemon_detail_round_trips_real_sprite_crop_values() {
        let conn = seed_static_db(&[pokemon_row(201, "unown", 2, false)]);
        conn.execute(
            "UPDATE pokemon SET sprite_crop_x = 0.385, sprite_crop_y = 0.333, sprite_crop_width = 0.229, sprite_crop_height = 0.333 WHERE id = 201",
            [],
        )
        .unwrap();
        let result = get_pokemon_detail_impl(&conn, 201, 0).unwrap();
        assert_eq!(result.sprite_crop_x, 0.385);
        assert_eq!(result.sprite_crop_y, 0.333);
        assert_eq!(result.sprite_crop_width, 0.229);
        assert_eq!(result.sprite_crop_height, 0.333);
    }

    #[test]
    fn get_pokemon_detail_round_trips_shiny_sprite_crop_independently_of_the_standard_one() {
        // Regression test for a real, user-reported bug: Hisuian Lilligant's
        // shiny sprite genuinely extends further (height fraction 1.0,
        // touching the canvas edge) than its standard sprite's (0.848) —
        // confirmed by directly re-measuring both real sprites' alpha
        // bounding boxes. Reusing the standard crop for shiny (an earlier
        // version's behavior) clipped real shiny-only artwork (a sparkle
        // highlight); the shiny crop must round-trip independently.
        let conn = seed_static_db(&[pokemon_row(549, "lilligant-hisui", 8, false)]);
        conn.execute(
            "UPDATE pokemon SET
                sprite_crop_x = 0.204, sprite_crop_y = 0.116, sprite_crop_width = 0.596, sprite_crop_height = 0.848,
                sprite_crop_x_shiny = 0.147, sprite_crop_y_shiny = 0.0, sprite_crop_width_shiny = 0.703, sprite_crop_height_shiny = 1.0
             WHERE id = 549",
            [],
        )
        .unwrap();
        let result = get_pokemon_detail_impl(&conn, 549, 0).unwrap();
        assert_eq!(result.sprite_crop_x, 0.204, "the standard crop should be unaffected");
        assert_eq!(result.sprite_crop_height, 0.848);
        assert_eq!(result.sprite_crop_x_shiny, 0.147);
        assert_eq!(result.sprite_crop_y_shiny, 0.0);
        assert_eq!(result.sprite_crop_width_shiny, 0.703);
        assert_eq!(result.sprite_crop_height_shiny, 1.0);
    }
}
