use crate::db::AppState;
use crate::models::{
    CollectionEntry, CollectionStatus, DexGroupBy, DexProgressBucket, Game, Method,
};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

const COLLECTION_COLUMNS: &str = "id, pokemon_id, form_id, status, is_shiny, encounter_count, \
     has_shiny_charm, sandwich_active, outbreak_active, chain_count, game_caught, method_used, \
     caught_at, notes, updated_at, synced_at";

/// Maps a row from a `SELECT {COLLECTION_COLUMNS} FROM collection ...` query.
/// Positional, not by-name — libsql's `Row` is index-based.
pub(crate) fn row_to_collection_entry(row: &libsql::Row) -> Result<CollectionEntry, String> {
    let game_caught: Option<String> = row.get(10).map_err(|e| e.to_string())?;
    let method_used: Option<String> = row.get(11).map_err(|e| e.to_string())?;
    let status: String = row.get(3).map_err(|e| e.to_string())?;

    Ok(CollectionEntry {
        id: row.get(0).map_err(|e| e.to_string())?,
        pokemon_id: row.get(1).map_err(|e| e.to_string())?,
        form_id: row.get(2).map_err(|e| e.to_string())?,
        status: CollectionStatus::from_str(&status)?,
        is_shiny: row.get::<i64>(4).map_err(|e| e.to_string())? != 0,
        encounter_count: row.get(5).map_err(|e| e.to_string())?,
        has_shiny_charm: row.get::<i64>(6).map_err(|e| e.to_string())? != 0,
        sandwich_active: row.get::<i64>(7).map_err(|e| e.to_string())? != 0,
        outbreak_active: row.get::<i64>(8).map_err(|e| e.to_string())? != 0,
        chain_count: row.get(9).map_err(|e| e.to_string())?,
        game_caught: game_caught.map(|g| Game::from_str(&g)).transpose()?,
        method_used: method_used.map(|m| Method::from_str(&m)).transpose()?,
        caught_at: row.get(12).map_err(|e| e.to_string())?,
        notes: row.get(13).map_err(|e| e.to_string())?,
        updated_at: row.get(14).map_err(|e| e.to_string())?,
        synced_at: row.get(15).map_err(|e| e.to_string())?,
    })
}

/// Every command below upserts a row, then re-selects it — this means
/// they return the full updated entry rather than `Ok(())`, so the frontend's
/// TanStack Query mutations can update their cache straight from the response.
pub(crate) async fn fetch_entry(
    conn: &libsql::Connection,
    pokemon_id: i32,
    form_id: i32,
) -> Result<CollectionEntry, String> {
    let mut rows = conn
        .query(
            &format!(
                "SELECT {COLLECTION_COLUMNS} FROM collection \
                 WHERE pokemon_id = ?1 AND form_id = ?2 AND deleted_at IS NULL"
            ),
            libsql::params![pokemon_id, form_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    match rows.next().await.map_err(|e| e.to_string())? {
        Some(row) => row_to_collection_entry(&row),
        // No row yet — most species won't have one until the user first
        // interacts with them. Return a default, not an error.
        None => Ok(CollectionEntry {
            id: String::new(),
            pokemon_id,
            form_id,
            status: CollectionStatus::NotStarted,
            is_shiny: false,
            encounter_count: 0,
            has_shiny_charm: false,
            sandwich_active: false,
            outbreak_active: false,
            chain_count: 0,
            game_caught: None,
            method_used: None,
            caught_at: None,
            notes: None,
            updated_at: String::new(),
            synced_at: None,
        }),
    }
}

/// Takes `&AppState`, not `&State<'_, AppState>` — `State` has no public
/// constructor outside Tauri's own IPC dispatch, so this signature is what
/// makes the function callable from tests at all. Every call site below
/// still just writes `&state`; `State: Deref<Target = AppState>` means Rust
/// coerces it automatically, no call-site change needed.
pub(crate) async fn require_sync_db(state: &AppState) -> Result<libsql::Connection, String> {
    state
        .sync_db
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .map(|synced| synced.conn)
        .ok_or_else(|| "Sync not configured — set up Turso credentials in Settings first".to_string())
}

/// Like `require_sync_db`, but returns the `Database` handle `.sync()` lives
/// on, for `force_sync` specifically.
pub(crate) fn require_sync_database(state: &AppState) -> Result<Arc<libsql::Database>, String> {
    state
        .sync_db
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .map(|synced| synced.db)
        .ok_or_else(|| "Sync not configured — set up Turso credentials in Settings first".to_string())
}

#[tauri::command]
pub async fn get_collection_entry(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
) -> Result<CollectionEntry, String> {
    let conn = require_sync_db(&state).await?;
    fetch_entry(&conn, pokemon_id, form_id).await
}

#[tauri::command]
pub async fn update_status(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
    status: CollectionStatus,
) -> Result<CollectionEntry, String> {
    let conn = require_sync_db(&state).await?;
    update_status_impl(&conn, pokemon_id, form_id, status).await
}

async fn update_status_impl(
    conn: &libsql::Connection,
    pokemon_id: i32,
    form_id: i32,
    status: CollectionStatus,
) -> Result<CollectionEntry, String> {
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO collection (id, pokemon_id, form_id, status, updated_at) \
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) \
         ON CONFLICT (pokemon_id, form_id) DO UPDATE SET \
         status = excluded.status, updated_at = excluded.updated_at",
        libsql::params![id, pokemon_id, form_id, status.as_str()],
    )
    .await
    .map_err(|e| e.to_string())?;

    fetch_entry(conn, pokemon_id, form_id).await
}

#[tauri::command]
pub async fn mark_caught(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
    is_shiny: bool,
    game_caught: Game,
    method_used: Method,
) -> Result<CollectionEntry, String> {
    let conn = require_sync_db(&state).await?;
    mark_caught_impl(&conn, pokemon_id, form_id, is_shiny, game_caught, method_used).await
}

pub(crate) async fn mark_caught_impl(
    conn: &libsql::Connection,
    pokemon_id: i32,
    form_id: i32,
    is_shiny: bool,
    game_caught: Game,
    method_used: Method,
) -> Result<CollectionEntry, String> {
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO collection \
         (id, pokemon_id, form_id, status, is_shiny, game_caught, method_used, caught_at, updated_at) \
         VALUES (?1, ?2, ?3, 'caught', ?4, ?5, ?6, \
         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) \
         ON CONFLICT (pokemon_id, form_id) DO UPDATE SET \
         status = 'caught', is_shiny = excluded.is_shiny, game_caught = excluded.game_caught, \
         method_used = excluded.method_used, caught_at = excluded.caught_at, \
         updated_at = excluded.updated_at",
        libsql::params![
            id,
            pokemon_id,
            form_id,
            is_shiny as i64,
            game_caught.as_str(),
            method_used.as_str()
        ],
    )
    .await
    .map_err(|e| e.to_string())?;

    fetch_entry(conn, pokemon_id, form_id).await
}

/// Resets active-hunt progress (encounter counter, checklist) and reverts
/// status to `not_started`. Does not touch historical caught_at/game_caught —
/// resetting an already-caught entry isn't a supported flow from the UI.
#[tauri::command]
pub async fn reset_hunt(
    state: State<'_, AppState>,
    pokemon_id: i32,
    form_id: i32,
) -> Result<CollectionEntry, String> {
    let conn = require_sync_db(&state).await?;
    reset_hunt_impl(&conn, pokemon_id, form_id).await
}

async fn reset_hunt_impl(conn: &libsql::Connection, pokemon_id: i32, form_id: i32) -> Result<CollectionEntry, String> {
    conn.execute(
        "UPDATE collection SET status = 'not_started', encounter_count = 0, \
         has_shiny_charm = 0, sandwich_active = 0, outbreak_active = 0, chain_count = 0, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') \
         WHERE pokemon_id = ?1 AND form_id = ?2",
        libsql::params![pokemon_id, form_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    fetch_entry(conn, pokemon_id, form_id).await
}

/// Living Dex progress: shiny-caught count vs. total species, grouped by
/// generation or type. Static (pokemon) and synced (collection) data live in
/// separate database connections by design (§4 of the architecture plan), so
/// this joins them in Rust rather than in SQL.
#[tauri::command]
pub async fn get_living_dex_stats(
    state: State<'_, AppState>,
    group_by: DexGroupBy,
) -> Result<Vec<DexProgressBucket>, String> {
    let static_groups = {
        let conn = state.static_db.lock().map_err(|e| e.to_string())?;
        read_static_groups(&conn, group_by)?
    };
    let sync_conn = require_sync_db(&state).await?;
    get_living_dex_stats_impl(static_groups, &sync_conn, group_by).await
}

fn read_static_groups(
    conn: &rusqlite::Connection,
    group_by: DexGroupBy,
) -> Result<Vec<(i32, i32, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT id, form_id, generation, types FROM pokemon")
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, i32>(1)?,
                if matches!(group_by, DexGroupBy::Generation) {
                    row.get::<_, i32>(2)?.to_string()
                } else {
                    row.get::<_, String>(3)?
                },
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(mapped)
}

async fn get_living_dex_stats_impl(
    static_groups: Vec<(i32, i32, String)>,
    sync_conn: &libsql::Connection,
    group_by: DexGroupBy,
) -> Result<Vec<DexProgressBucket>, String> {
    let mut shiny_rows = sync_conn
        .query(
            "SELECT pokemon_id, form_id FROM collection \
             WHERE is_shiny = 1 AND status = 'caught' AND deleted_at IS NULL",
            (),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut caught: std::collections::HashSet<(i32, i32)> = std::collections::HashSet::new();
    while let Some(row) = shiny_rows.next().await.map_err(|e| e.to_string())? {
        let pokemon_id: i32 = row.get(0).map_err(|e| e.to_string())?;
        let form_id: i32 = row.get(1).map_err(|e| e.to_string())?;
        caught.insert((pokemon_id, form_id));
    }

    let mut buckets: HashMap<String, (i32, i32)> = HashMap::new();
    for (pokemon_id, form_id, label_source) in static_groups {
        let labels: Vec<String> = if matches!(group_by, DexGroupBy::Type) {
            serde_json::from_str(&label_source).unwrap_or_default()
        } else {
            vec![label_source]
        };
        let is_caught = caught.contains(&(pokemon_id, form_id));
        for label in labels {
            let entry = buckets.entry(label).or_insert((0, 0));
            entry.1 += 1;
            if is_caught {
                entry.0 += 1;
            }
        }
    }

    let mut result: Vec<DexProgressBucket> = buckets
        .into_iter()
        .map(|(label, (caught, total))| DexProgressBucket { label, caught, total })
        .collect();
    result.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(result)
}

/// Backs the Pokédex grid's per-card status badges — every non-deleted
/// collection row regardless of status, so the frontend can render
/// caught/shiny/hunting indicators without an N+1 fetch per card.
#[tauri::command]
pub async fn get_all_collection_entries(state: State<'_, AppState>) -> Result<Vec<CollectionEntry>, String> {
    let conn = require_sync_db(&state).await?;
    get_all_collection_entries_impl(&conn).await
}

async fn get_all_collection_entries_impl(conn: &libsql::Connection) -> Result<Vec<CollectionEntry>, String> {
    let mut rows = conn
        .query(
            &format!("SELECT {COLLECTION_COLUMNS} FROM collection WHERE deleted_at IS NULL"),
            (),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        entries.push(row_to_collection_entry(&row)?);
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::SyncedDb;
    use crate::test_support::{bare_static_db, local_synced_db};
    use std::sync::Mutex;

    fn app_state(sync_db: Option<SyncedDb>) -> AppState {
        AppState {
            static_db: Arc::new(Mutex::new(bare_static_db())),
            sync_db: Arc::new(Mutex::new(sync_db)),
        }
    }

    #[tokio::test]
    async fn fetch_entry_returns_a_default_not_started_row_when_none_exists() {
        let (_db, conn) = local_synced_db().await;
        let entry = fetch_entry(&conn, 1, 0).await.unwrap();
        assert_eq!(entry.status, CollectionStatus::NotStarted);
        assert_eq!(entry.pokemon_id, 1);
        assert_eq!(entry.form_id, 0);
        assert_eq!(entry.encounter_count, 0);
    }

    #[tokio::test]
    async fn update_status_upserts_not_duplicates() {
        let (_db, conn) = local_synced_db().await;
        update_status_impl(&conn, 1, 0, CollectionStatus::Hunting).await.unwrap();
        let entry = update_status_impl(&conn, 1, 0, CollectionStatus::Caught).await.unwrap();
        assert_eq!(entry.status, CollectionStatus::Caught);

        let mut rows = conn.query("SELECT COUNT(*) FROM collection WHERE pokemon_id = 1 AND form_id = 0", ()).await.unwrap();
        let count: i64 = rows.next().await.unwrap().unwrap().get(0).unwrap();
        assert_eq!(count, 1, "expected one row, not a duplicate insert");
    }

    #[tokio::test]
    async fn mark_caught_records_shiny_game_and_method() {
        let (_db, conn) = local_synced_db().await;
        let entry = mark_caught_impl(&conn, 1, 0, true, Game::Sv, Method::Outbreak).await.unwrap();
        assert_eq!(entry.status, CollectionStatus::Caught);
        assert!(entry.is_shiny);
        assert_eq!(entry.game_caught, Some(Game::Sv));
        assert_eq!(entry.method_used, Some(Method::Outbreak));
    }

    #[tokio::test]
    async fn reset_hunt_clears_progress_without_touching_caught_history() {
        let (_db, conn) = local_synced_db().await;
        mark_caught_impl(&conn, 1, 0, true, Game::Sv, Method::Outbreak).await.unwrap();

        let entry = reset_hunt_impl(&conn, 1, 0).await.unwrap();
        assert_eq!(entry.status, CollectionStatus::NotStarted);
        assert_eq!(entry.encounter_count, 0);
        // reset_hunt doesn't touch caught_at/game_caught/method_used/is_shiny —
        // confirmed those remain from the prior mark_caught, not cleared.
        assert!(entry.is_shiny);
        assert_eq!(entry.game_caught, Some(Game::Sv));
    }

    #[tokio::test]
    async fn get_all_collection_entries_impl_returns_every_non_deleted_row() {
        let (_db, conn) = local_synced_db().await;
        update_status_impl(&conn, 1, 0, CollectionStatus::Hunting).await.unwrap();
        update_status_impl(&conn, 2, 0, CollectionStatus::Caught).await.unwrap();

        let entries = get_all_collection_entries_impl(&conn).await.unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[tokio::test]
    async fn get_living_dex_stats_impl_counts_shiny_caught_against_total_by_generation() {
        let (_db, conn) = local_synced_db().await;
        mark_caught_impl(&conn, 1, 0, true, Game::Sv, Method::Outbreak).await.unwrap();

        // 2 species in gen 1 (one caught shiny), 1 in gen 3 (none caught).
        let static_groups = vec![
            (1, 0, "1".to_string()),
            (2, 0, "1".to_string()),
            (3, 0, "3".to_string()),
        ];
        let buckets = get_living_dex_stats_impl(static_groups, &conn, DexGroupBy::Generation).await.unwrap();

        let gen1 = buckets.iter().find(|b| b.label == "1").unwrap();
        assert_eq!((gen1.caught, gen1.total), (1, 2));
        let gen3 = buckets.iter().find(|b| b.label == "3").unwrap();
        assert_eq!((gen3.caught, gen3.total), (0, 1));
    }

    #[tokio::test]
    async fn require_sync_db_errors_clearly_when_sync_is_not_configured() {
        let state = app_state(None);
        let err = require_sync_db(&state).await.unwrap_err();
        assert!(err.contains("Sync not configured"));
    }

    #[tokio::test]
    async fn require_sync_db_returns_the_connection_when_configured() {
        let (db, conn) = local_synced_db().await;
        let state = app_state(Some(SyncedDb { db, conn }));
        assert!(require_sync_db(&state).await.is_ok());
    }

    #[test]
    fn require_sync_database_errors_clearly_when_sync_is_not_configured() {
        let state = app_state(None);
        let err = require_sync_database(&state).unwrap_err();
        assert!(err.contains("Sync not configured"));
    }
}
