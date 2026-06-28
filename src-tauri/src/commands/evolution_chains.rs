use crate::commands::cosmetic_forms::row_to_cosmetic_form;
use crate::commands::pokedex::row_to_pokemon;
use crate::db::AppState;
use crate::models::{EvolutionChainData, EvolutionChainEdge, EvolutionChainMember};
use rusqlite::Connection;
use tauri::State;

/// Every species/form in the same evolution chain as (pokemon_id, form_id) plus every real edge between them — for the detail page's evolution-line navigation.
#[tauri::command]
pub fn get_evolution_chain(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
) -> Result<EvolutionChainData, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    get_evolution_chain_impl(&conn, pokemon_id, form_id)
}

fn get_evolution_chain_impl(conn: &Connection, pokemon_id: i32, form_id: i32) -> Result<EvolutionChainData, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.*, ec.stage AS chain_stage FROM pokemon p \
             JOIN evolution_chains ec ON ec.pokemon_id = p.id AND ec.form_id = p.form_id \
             WHERE ec.chain_id = (SELECT chain_id FROM evolution_chains WHERE pokemon_id = ?1 AND form_id = ?2) \
             ORDER BY ec.stage, p.id, p.form_id",
        )
        .map_err(|e| e.to_string())?;
    let members = stmt
        .query_map(rusqlite::params![pokemon_id, form_id], |row| {
            Ok(EvolutionChainMember { pokemon: row_to_pokemon(row)?, stage: row.get("chain_stage")? })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let mut edge_stmt = conn
        .prepare(
            "SELECT from_pokemon_id, from_form_id, to_pokemon_id, to_form_id, from_cosmetic_kind FROM evolution_edges \
             WHERE chain_id = (SELECT chain_id FROM evolution_chains WHERE pokemon_id = ?1 AND form_id = ?2)",
        )
        .map_err(|e| e.to_string())?;
    let edges = edge_stmt
        .query_map(rusqlite::params![pokemon_id, form_id], |row| {
            Ok(EvolutionChainEdge {
                from_pokemon_id: row.get("from_pokemon_id")?,
                from_form_id: row.get("from_form_id")?,
                to_pokemon_id: row.get("to_pokemon_id")?,
                to_form_id: row.get("to_form_id")?,
                from_cosmetic_kind: row.get("from_cosmetic_kind")?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let mut cosmetic_stmt = conn
        .prepare(
            "SELECT cf.* FROM cosmetic_forms cf \
             JOIN evolution_chains ec ON ec.pokemon_id = cf.pokemon_id AND ec.form_id = cf.form_id \
             WHERE ec.chain_id = (SELECT chain_id FROM evolution_chains WHERE pokemon_id = ?1 AND form_id = ?2) \
             ORDER BY cf.id",
        )
        .map_err(|e| e.to_string())?;
    let cosmetic_forms = cosmetic_stmt
        .query_map(rusqlite::params![pokemon_id, form_id], row_to_cosmetic_form)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(EvolutionChainData { members, edges, cosmetic_forms })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{
        seed_cosmetic_forms, seed_evolution_chains, seed_evolution_edges, seed_static_db, TestCosmeticFormRow, TestEvolutionChainRow,
        TestEvolutionEdgeRow, TestPokemonRow,
    };

    #[test]
    fn get_evolution_chain_returns_every_member_in_stage_order_regardless_of_which_is_queried() {
        let conn = seed_static_db(&[
            TestPokemonRow { id: 1, display_name: "Bulbasaur".into(), ..Default::default() },
            TestPokemonRow { id: 2, display_name: "Ivysaur".into(), ..Default::default() },
            TestPokemonRow { id: 3, display_name: "Venusaur".into(), ..Default::default() },
        ]);
        seed_evolution_chains(&conn, &[
            TestEvolutionChainRow { pokemon_id: 1, form_id: 0, chain_id: 1, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 2, form_id: 0, chain_id: 1, stage: 1 },
            TestEvolutionChainRow { pokemon_id: 3, form_id: 0, chain_id: 1, stage: 2 },
        ]);

        for (id, form_id) in [(1, 0), (2, 0), (3, 0)] {
            let chain = get_evolution_chain_impl(&conn, id, form_id).unwrap().members;
            assert_eq!(
                chain.iter().map(|m| m.pokemon.display_name.clone()).collect::<Vec<_>>(),
                vec!["Bulbasaur", "Ivysaur", "Venusaur"],
                "expected the full chain in stage order when queried via pokemon_id={id}",
            );
            assert_eq!(
                chain.iter().map(|m| m.stage).collect::<Vec<_>>(),
                vec![0, 1, 2],
                "expected each member's own stage value to come back alongside it",
            );
        }
    }

    #[test]
    fn get_evolution_chain_returns_a_branching_chain_with_the_root_first() {
        let conn = seed_static_db(&[
            TestPokemonRow { id: 133, display_name: "Eevee".into(), ..Default::default() },
            TestPokemonRow { id: 134, display_name: "Vaporeon".into(), ..Default::default() },
            TestPokemonRow { id: 135, display_name: "Jolteon".into(), ..Default::default() },
            TestPokemonRow { id: 136, display_name: "Flareon".into(), ..Default::default() },
        ]);
        seed_evolution_chains(&conn, &[
            TestEvolutionChainRow { pokemon_id: 133, form_id: 0, chain_id: 7, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 134, form_id: 0, chain_id: 7, stage: 1 },
            TestEvolutionChainRow { pokemon_id: 135, form_id: 0, chain_id: 7, stage: 1 },
            TestEvolutionChainRow { pokemon_id: 136, form_id: 0, chain_id: 7, stage: 1 },
        ]);

        let chain = get_evolution_chain_impl(&conn, 135, 0).unwrap().members;
        assert_eq!(chain.len(), 4);
        assert_eq!(chain[0].pokemon.display_name, "Eevee");
        assert_eq!(chain[0].stage, 0, "expected Eevee at stage 0");
        assert_eq!(
            chain[1..].iter().map(|m| m.stage).collect::<Vec<_>>(),
            vec![1, 1, 1],
            "expected all 3 Eeveelutions to share stage 1, not read as a sequential chain",
        );
    }

    #[test]
    fn get_evolution_chain_never_leaks_rows_from_a_different_chain() {
        let conn = seed_static_db(&[
            TestPokemonRow { id: 1, display_name: "Bulbasaur".into(), ..Default::default() },
            TestPokemonRow { id: 4, display_name: "Charmander".into(), ..Default::default() },
        ]);
        seed_evolution_chains(&conn, &[
            TestEvolutionChainRow { pokemon_id: 1, form_id: 0, chain_id: 1, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 4, form_id: 0, chain_id: 2, stage: 0 },
        ]);

        let chain = get_evolution_chain_impl(&conn, 1, 0).unwrap().members;
        assert_eq!(chain.len(), 1);
        assert_eq!(chain[0].pokemon.display_name, "Bulbasaur");
    }

    #[test]
    fn get_evolution_chain_returns_empty_for_a_species_with_no_chain_row() {
        let conn = seed_static_db(&[TestPokemonRow { id: 1, ..Default::default() }]);
        let result = get_evolution_chain_impl(&conn, 1, 0).unwrap();
        assert!(result.members.is_empty());
        assert!(result.edges.is_empty());
    }

    #[test]
    fn get_evolution_chain_returns_edges_scoped_to_the_queried_chain_only() {
        let conn = seed_static_db(&[
            TestPokemonRow { id: 19, display_name: "Rattata".into(), ..Default::default() },
            TestPokemonRow { id: 19, form_id: 1, display_name: "Alolan Rattata".into(), ..Default::default() },
            TestPokemonRow { id: 20, display_name: "Raticate".into(), ..Default::default() },
            TestPokemonRow { id: 20, form_id: 1, display_name: "Alolan Raticate".into(), ..Default::default() },
            TestPokemonRow { id: 1, display_name: "Bulbasaur".into(), ..Default::default() },
            TestPokemonRow { id: 2, display_name: "Ivysaur".into(), ..Default::default() },
        ]);
        seed_evolution_chains(&conn, &[
            TestEvolutionChainRow { pokemon_id: 19, form_id: 0, chain_id: 7, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 19, form_id: 1, chain_id: 7, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 20, form_id: 0, chain_id: 7, stage: 1 },
            TestEvolutionChainRow { pokemon_id: 20, form_id: 1, chain_id: 7, stage: 1 },
            TestEvolutionChainRow { pokemon_id: 1, form_id: 0, chain_id: 1, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 2, form_id: 0, chain_id: 1, stage: 1 },
        ]);
        seed_evolution_edges(&conn, &[
            TestEvolutionEdgeRow { chain_id: 7, from_pokemon_id: 19, from_form_id: 0, to_pokemon_id: 20, to_form_id: 0, ..Default::default() },
            TestEvolutionEdgeRow { chain_id: 7, from_pokemon_id: 19, from_form_id: 1, to_pokemon_id: 20, to_form_id: 1, ..Default::default() },
            TestEvolutionEdgeRow { chain_id: 1, from_pokemon_id: 1, from_form_id: 0, to_pokemon_id: 2, to_form_id: 0, ..Default::default() },
        ]);

        let result = get_evolution_chain_impl(&conn, 19, 0).unwrap();
        assert_eq!(result.edges.len(), 2, "expected only Rattata's own 2 edges, not Bulbasaur's");
        assert!(
            result.edges.iter().any(|e| e.from_form_id == 0 && e.to_form_id == 0)
                && result.edges.iter().any(|e| e.from_form_id == 1 && e.to_form_id == 1),
            "expected Kantonian->Kantonian and Alolan->Alolan, never cross-connected",
        );
    }

    #[test]
    fn get_evolution_chain_round_trips_from_cosmetic_kind() {
        let conn = seed_static_db(&[
            TestPokemonRow { id: 412, display_name: "Burmy".into(), ..Default::default() },
            TestPokemonRow { id: 413, display_name: "Sandy Wormadam".into(), ..Default::default() },
            TestPokemonRow { id: 414, display_name: "Mothim".into(), ..Default::default() },
        ]);
        seed_evolution_chains(&conn, &[
            TestEvolutionChainRow { pokemon_id: 412, form_id: 0, chain_id: 99, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 413, form_id: 0, chain_id: 99, stage: 1 },
            TestEvolutionChainRow { pokemon_id: 414, form_id: 0, chain_id: 99, stage: 1 },
        ]);
        seed_evolution_edges(&conn, &[
            TestEvolutionEdgeRow { chain_id: 99, from_pokemon_id: 412, to_pokemon_id: 413, from_cosmetic_kind: Some("sandy".into()), ..Default::default() },
            TestEvolutionEdgeRow { chain_id: 99, from_pokemon_id: 412, to_pokemon_id: 414, ..Default::default() },
        ]);

        let result = get_evolution_chain_impl(&conn, 412, 0).unwrap();
        let to_wormadam = result.edges.iter().find(|e| e.to_pokemon_id == 413).unwrap();
        let to_mothim = result.edges.iter().find(|e| e.to_pokemon_id == 414).unwrap();
        assert_eq!(to_wormadam.from_cosmetic_kind, Some("sandy".to_string()));
        assert_eq!(to_mothim.from_cosmetic_kind, None, "expected no cosmetic-kind requirement for the Mothim edge — any Burmy cloak can become Mothim");
    }

    #[test]
    fn get_evolution_chain_bundles_cosmetic_forms_for_every_member_not_just_the_queried_one() {
        let conn = seed_static_db(&[
            TestPokemonRow { id: 412, display_name: "Burmy".into(), ..Default::default() },
            TestPokemonRow { id: 413, display_name: "Sandy Wormadam".into(), ..Default::default() },
        ]);
        seed_evolution_chains(&conn, &[
            TestEvolutionChainRow { pokemon_id: 412, form_id: 0, chain_id: 99, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 413, form_id: 0, chain_id: 99, stage: 1 },
        ]);
        seed_cosmetic_forms(&conn, &[
            TestCosmeticFormRow { pokemon_id: 412, form_id: 0, kind: "sandy".into(), display_name: "Sandy Burmy".into(), ..Default::default() },
            TestCosmeticFormRow { pokemon_id: 412, form_id: 0, kind: "trash".into(), display_name: "Trash Burmy".into(), ..Default::default() },
        ]);

        // Burmy's own cosmetic forms must come back even when the chain is
        // queried via Wormadam's own (pokemon_id, form_id) — viewing the
        // evolution line from Wormadam's page is exactly the case that was
        // broken before this bundling existed, since Wormadam itself has no
        // cosmetic_forms rows of its own.
        let result = get_evolution_chain_impl(&conn, 413, 0).unwrap();
        assert_eq!(result.cosmetic_forms.len(), 2);
        assert!(result.cosmetic_forms.iter().any(|f| f.pokemon_id == 412 && f.kind == "sandy"));
        assert!(result.cosmetic_forms.iter().any(|f| f.pokemon_id == 412 && f.kind == "trash"));
    }

    #[test]
    fn get_evolution_chain_never_leaks_cosmetic_forms_from_a_different_chain() {
        let conn = seed_static_db(&[
            TestPokemonRow { id: 412, display_name: "Burmy".into(), ..Default::default() },
            TestPokemonRow { id: 1, display_name: "Bulbasaur".into(), ..Default::default() },
        ]);
        seed_evolution_chains(&conn, &[
            TestEvolutionChainRow { pokemon_id: 412, form_id: 0, chain_id: 99, stage: 0 },
            TestEvolutionChainRow { pokemon_id: 1, form_id: 0, chain_id: 1, stage: 0 },
        ]);
        seed_cosmetic_forms(&conn, &[
            TestCosmeticFormRow { pokemon_id: 412, form_id: 0, kind: "sandy".into(), display_name: "Sandy Burmy".into(), ..Default::default() },
        ]);

        let result = get_evolution_chain_impl(&conn, 1, 0).unwrap();
        assert!(result.cosmetic_forms.is_empty(), "expected Bulbasaur's chain to see none of Burmy's cosmetic forms");
    }
}
