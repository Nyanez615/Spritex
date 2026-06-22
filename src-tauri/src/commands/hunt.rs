use crate::commands::collection::{fetch_entry, require_sync_db};
use crate::db::AppState;
use crate::models::{ChecklistField, CollectionEntry};
use tauri::State;
use uuid::Uuid;

/// `amount` is validated server-side to the three values the UI actually
/// exposes (+1 / +10 / +100) — never trust the client to send an arbitrary
/// increment.
#[tauri::command]
pub async fn increment_counter(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
    amount: i32,
) -> Result<CollectionEntry, String> {
    if !matches!(amount, 1 | 10 | 100) {
        return Err(format!("invalid increment amount: {amount} (must be 1, 10, or 100)"));
    }

    let conn = require_sync_db(&state).await?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO collection (id, pokemon_id, form_id, status, encounter_count, updated_at) \
         VALUES (?1, ?2, ?3, 'hunting', ?4, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) \
         ON CONFLICT (pokemon_id, form_id) DO UPDATE SET \
         encounter_count = encounter_count + excluded.encounter_count, \
         status = CASE WHEN collection.status = 'not_started' THEN 'hunting' ELSE collection.status END, \
         updated_at = excluded.updated_at",
        libsql::params![id, pokemon_id, form_id, amount],
    )
    .await
    .map_err(|e| e.to_string())?;

    fetch_entry(&conn, pokemon_id, form_id).await
}

#[tauri::command]
pub async fn toggle_checklist(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
    field: ChecklistField,
    value: bool,
) -> Result<CollectionEntry, String> {
    let conn = require_sync_db(&state).await?;
    let id = Uuid::new_v4().to_string();
    let column = match field {
        ChecklistField::HasShinyCharm => "has_shiny_charm",
        ChecklistField::SandwichActive => "sandwich_active",
        ChecklistField::OutbreakActive => "outbreak_active",
    };

    let sql = format!(
        "INSERT INTO collection (id, pokemon_id, form_id, {column}, updated_at) \
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) \
         ON CONFLICT (pokemon_id, form_id) DO UPDATE SET \
         {column} = excluded.{column}, updated_at = excluded.updated_at"
    );

    conn.execute(&sql, libsql::params![id, pokemon_id, form_id, value as i64])
        .await
        .map_err(|e| e.to_string())?;

    fetch_entry(&conn, pokemon_id, form_id).await
}

/// Backs `/hunt` — every entry currently being actively hunted, most-overdue
/// first (highest encounter_count relative to nothing caught yet reads as
/// "most overdue" in the absence of a per-row odds join here; the frontend
/// can re-sort by actual odds once it has both this and get_methods_for_pokemon).
#[tauri::command]
pub async fn get_active_hunts(state: State<'_, AppState>) -> Result<Vec<CollectionEntry>, String> {
    let conn = require_sync_db(&state).await?;
    let mut rows = conn
        .query(
            "SELECT id, pokemon_id, form_id, status, is_shiny, encounter_count, \
             has_shiny_charm, sandwich_active, outbreak_active, chain_count, game_caught, \
             method_used, caught_at, notes, updated_at, synced_at FROM collection \
             WHERE status = 'hunting' AND deleted_at IS NULL ORDER BY encounter_count DESC",
            (),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        entries.push(crate::commands::collection::row_to_collection_entry(&row)?);
    }
    Ok(entries)
}
