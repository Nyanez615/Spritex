use crate::db::AppState;
use crate::models::CosmeticForm;
use rusqlite::{Connection, Row};
use tauri::State;

pub(crate) fn row_to_cosmetic_form(row: &Row) -> rusqlite::Result<CosmeticForm> {
    Ok(CosmeticForm {
        id: row.get("id")?,
        pokemon_id: row.get("pokemon_id")?,
        form_id: row.get("form_id")?,
        kind: row.get("kind")?,
        display_name: row.get("display_name")?,
        sprite_url: row.get("sprite_url")?,
        shiny_sprite_url: row.get("shiny_sprite_url")?,
        sprite_crop_x: row.get("sprite_crop_x")?,
        sprite_crop_y: row.get("sprite_crop_y")?,
        sprite_crop_width: row.get("sprite_crop_width")?,
        sprite_crop_height: row.get("sprite_crop_height")?,
        sprite_crop_x_shiny: row.get("sprite_crop_x_shiny")?,
        sprite_crop_y_shiny: row.get("sprite_crop_y_shiny")?,
        sprite_crop_width_shiny: row.get("sprite_crop_width_shiny")?,
        sprite_crop_height_shiny: row.get("sprite_crop_height_shiny")?,
        mega_stone_item: row.get("mega_stone_item")?,
        types: row.get("types")?,
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
    })
}

/// Every sprite-bearing alternate appearance for the sprite gallery on the detail page — Mega/Gigantamax/battle-only forms with their own real stat block (held item only for Mega) AND purely decorative sprite variants with no mechanical difference at all (Unown's letters, Arceus's types, ...). See CosmeticForm's own doc comment for the full scope.
#[tauri::command]
pub fn get_cosmetic_forms(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
) -> Result<Vec<CosmeticForm>, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    get_cosmetic_forms_impl(&conn, pokemon_id, form_id)
}

fn get_cosmetic_forms_impl(conn: &Connection, pokemon_id: i32, form_id: i32) -> Result<Vec<CosmeticForm>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM cosmetic_forms WHERE pokemon_id = ?1 AND form_id = ?2 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![pokemon_id, form_id], row_to_cosmetic_form)
        .map_err(|e| e.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{seed_cosmetic_forms, seed_static_db, TestCosmeticFormRow, TestPokemonRow};

    #[test]
    fn get_cosmetic_forms_filters_by_pokemon_id_and_form_id() {
        let conn = seed_static_db(&[
            TestPokemonRow { id: 3, ..Default::default() },
            TestPokemonRow { id: 6, ..Default::default() },
        ]);
        seed_cosmetic_forms(&conn, &[
            TestCosmeticFormRow { pokemon_id: 3, form_id: 0, kind: "mega".into(), display_name: "Mega Venusaur".into(), mega_stone_item: Some("venusaurite".into()), ..Default::default() },
            TestCosmeticFormRow { pokemon_id: 3, form_id: 0, kind: "gmax".into(), display_name: "Gigantamax Venusaur".into(), mega_stone_item: None, ..Default::default() },
            TestCosmeticFormRow { pokemon_id: 6, form_id: 0, kind: "mega_x".into(), display_name: "Mega Charizard X".into(), mega_stone_item: Some("charizardite-x".into()), ..Default::default() },
        ]);

        let venusaur_forms = get_cosmetic_forms_impl(&conn, 3, 0).unwrap();
        assert_eq!(venusaur_forms.len(), 2);
        assert!(venusaur_forms.iter().any(|f| f.kind == "mega" && f.mega_stone_item == Some("venusaurite".into())));
        assert!(venusaur_forms.iter().any(|f| f.kind == "gmax" && f.mega_stone_item.is_none()));

        let charizard_forms = get_cosmetic_forms_impl(&conn, 6, 0).unwrap();
        assert_eq!(charizard_forms.len(), 1);
        assert_eq!(charizard_forms[0].kind, "mega_x");
    }

    #[test]
    fn get_cosmetic_forms_returns_empty_for_a_species_with_no_mega_or_gmax_form() {
        let conn = seed_static_db(&[TestPokemonRow { id: 1, ..Default::default() }]);
        let forms = get_cosmetic_forms_impl(&conn, 1, 0).unwrap();
        assert!(forms.is_empty());
    }

    #[test]
    fn get_cosmetic_forms_round_trips_sprite_crop_fields() {
        let conn = seed_static_db(&[TestPokemonRow { id: 201, ..Default::default() }]);
        seed_cosmetic_forms(&conn, &[
            TestCosmeticFormRow {
                pokemon_id: 201, form_id: 0, kind: "b".into(), display_name: "Unown B".into(),
                sprite_crop_x: 0.385, sprite_crop_y: 0.333, sprite_crop_width: 0.229, sprite_crop_height: 0.333,
                ..Default::default()
            },
        ]);

        let forms = get_cosmetic_forms_impl(&conn, 201, 0).unwrap();
        assert_eq!(forms.len(), 1);
        assert_eq!(forms[0].sprite_crop_x, 0.385);
        assert_eq!(forms[0].sprite_crop_y, 0.333);
        assert_eq!(forms[0].sprite_crop_width, 0.229);
        assert_eq!(forms[0].sprite_crop_height, 0.333);
    }

    #[test]
    fn get_cosmetic_forms_defaults_sprite_crop_to_the_full_canvas_when_unset() {
        let conn = seed_static_db(&[TestPokemonRow { id: 6, ..Default::default() }]);
        seed_cosmetic_forms(&conn, &[
            TestCosmeticFormRow { pokemon_id: 6, form_id: 0, kind: "mega_x".into(), display_name: "Mega Charizard X".into(), ..Default::default() },
        ]);

        let forms = get_cosmetic_forms_impl(&conn, 6, 0).unwrap();
        assert_eq!(forms[0].sprite_crop_x, 0.0);
        assert_eq!(forms[0].sprite_crop_y, 0.0);
        assert_eq!(forms[0].sprite_crop_width, 1.0);
        assert_eq!(forms[0].sprite_crop_height, 1.0);
    }

    #[test]
    fn get_cosmetic_forms_round_trips_shiny_sprite_crop_independently_of_the_standard_one() {
        // Regression test for a real user-reported bug (Hisuian Lilligant):
        // a shiny sprite's own alpha shape can genuinely differ from its
        // non-shiny counterpart's, so the shiny crop must be stored and
        // read back independently, never assumed equal to the standard one.
        let conn = seed_static_db(&[TestPokemonRow { id: 201, ..Default::default() }]);
        seed_cosmetic_forms(&conn, &[
            TestCosmeticFormRow {
                pokemon_id: 201, form_id: 0, kind: "b".into(), display_name: "Unown B".into(),
                sprite_crop_x: 0.385, sprite_crop_y: 0.333, sprite_crop_width: 0.229, sprite_crop_height: 0.333,
                sprite_crop_x_shiny: 0.147, sprite_crop_y_shiny: 0.0, sprite_crop_width_shiny: 0.703, sprite_crop_height_shiny: 1.0,
                ..Default::default()
            },
        ]);

        let forms = get_cosmetic_forms_impl(&conn, 201, 0).unwrap();
        assert_eq!(forms[0].sprite_crop_x, 0.385, "the standard crop should be unaffected");
        assert_eq!(forms[0].sprite_crop_x_shiny, 0.147);
        assert_eq!(forms[0].sprite_crop_y_shiny, 0.0);
        assert_eq!(forms[0].sprite_crop_width_shiny, 0.703);
        assert_eq!(forms[0].sprite_crop_height_shiny, 1.0);
    }
}
