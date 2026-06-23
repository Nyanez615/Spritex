use crate::db::AppState;
use crate::models::CosmeticForm;
use rusqlite::{Connection, Row};
use tauri::State;

fn row_to_cosmetic_form(row: &Row) -> rusqlite::Result<CosmeticForm> {
    Ok(CosmeticForm {
        id: row.get("id")?,
        pokemon_id: row.get("pokemon_id")?,
        form_id: row.get("form_id")?,
        kind: row.get("kind")?,
        display_name: row.get("display_name")?,
        sprite_url: row.get("sprite_url")?,
        shiny_sprite_url: row.get("shiny_sprite_url")?,
        mega_stone_item: row.get("mega_stone_item")?,
    })
}

/// Mega/Gigantamax sprite variants + (mega only) the required held item, for the sprite gallery on the detail page.
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
            TestCosmeticFormRow { pokemon_id: 3, form_id: 0, kind: "mega".into(), display_name: "Mega Venusaur".into(), mega_stone_item: Some("venusaurite".into()) },
            TestCosmeticFormRow { pokemon_id: 3, form_id: 0, kind: "gmax".into(), display_name: "Gigantamax Venusaur".into(), mega_stone_item: None },
            TestCosmeticFormRow { pokemon_id: 6, form_id: 0, kind: "mega_x".into(), display_name: "Mega Charizard X".into(), mega_stone_item: Some("charizardite-x".into()) },
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
}
