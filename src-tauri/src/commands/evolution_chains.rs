use crate::commands::pokedex::row_to_pokemon;
use crate::db::AppState;
use crate::models::EvolutionChainMember;
use rusqlite::Connection;
use tauri::State;

/// Every species/form in the same evolution chain as (pokemon_id, form_id), ordered by stage — for the detail page's evolution-line navigation.
#[tauri::command]
pub fn get_evolution_chain(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
) -> Result<Vec<EvolutionChainMember>, String> {
    let conn = state.static_db.lock().map_err(|e| e.to_string())?;
    get_evolution_chain_impl(&conn, pokemon_id, form_id)
}

fn get_evolution_chain_impl(conn: &Connection, pokemon_id: i32, form_id: i32) -> Result<Vec<EvolutionChainMember>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.*, ec.stage AS chain_stage FROM pokemon p \
             JOIN evolution_chains ec ON ec.pokemon_id = p.id AND ec.form_id = p.form_id \
             WHERE ec.chain_id = (SELECT chain_id FROM evolution_chains WHERE pokemon_id = ?1 AND form_id = ?2) \
             ORDER BY ec.stage, p.id, p.form_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![pokemon_id, form_id], |row| {
            Ok(EvolutionChainMember { pokemon: row_to_pokemon(row)?, stage: row.get("chain_stage")? })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{seed_evolution_chains, seed_static_db, TestEvolutionChainRow, TestPokemonRow};

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
            let chain = get_evolution_chain_impl(&conn, id, form_id).unwrap();
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

        let chain = get_evolution_chain_impl(&conn, 135, 0).unwrap();
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

        let chain = get_evolution_chain_impl(&conn, 1, 0).unwrap();
        assert_eq!(chain.len(), 1);
        assert_eq!(chain[0].pokemon.display_name, "Bulbasaur");
    }

    #[test]
    fn get_evolution_chain_returns_empty_for_a_species_with_no_chain_row() {
        let conn = seed_static_db(&[TestPokemonRow { id: 1, ..Default::default() }]);
        let chain = get_evolution_chain_impl(&conn, 1, 0).unwrap();
        assert!(chain.is_empty());
    }
}
