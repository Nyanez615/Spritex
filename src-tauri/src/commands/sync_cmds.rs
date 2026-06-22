use crate::commands::collection::require_sync_database;
use crate::db::{self, AppState};
use crate::models::{SyncMode, SyncStatus};
use tauri::{AppHandle, State};

// Derived from Cargo.toml's [package] name at compile time, not hardcoded —
// a project rename only requires updating Cargo.toml, not this literal too.
const KEYRING_SERVICE: &str = env!("CARGO_PKG_NAME");
const KEYRING_TOKEN_KEY: &str = "turso_auth_token";
const KEYRING_URL_KEY: &str = "turso_db_url";

fn keyring_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let configured = state.sync_db.lock().map_err(|e| e.to_string())?.is_some();
    Ok(SyncStatus {
        last_synced_at: None,
        is_online: configured,
        mode: if configured {
            SyncMode::EmbeddedReplica
        } else {
            SyncMode::Unconfigured
        },
    })
}

#[tauri::command]
pub async fn force_sync(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let db = require_sync_database(&state)?;
    db.sync().await.map_err(|e| e.to_string())?;
    Ok(SyncStatus {
        last_synced_at: Some(chrono_now()),
        is_online: true,
        mode: SyncMode::EmbeddedReplica,
    })
}

fn chrono_now() -> String {
    // Avoids pulling in `chrono` as a direct dependency for one timestamp —
    // SQLite's own strftime is used everywhere else; mirror that format here.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

/// Writes credentials to the OS keychain and opens the embedded-replica
/// connection immediately, so sync is live without requiring a relaunch.
#[tauri::command]
pub async fn set_turso_credentials(
    app: AppHandle,
    state: State<'_, AppState>,
    db_url: String,
    auth_token: String,
) -> Result<(), String> {
    keyring_entry(KEYRING_URL_KEY)?
        .set_password(&db_url)
        .map_err(|e| e.to_string())?;
    keyring_entry(KEYRING_TOKEN_KEY)?
        .set_password(&auth_token)
        .map_err(|e| e.to_string())?;

    let synced = db::open_synced(&app, &db_url, &auth_token)
        .await
        .map_err(|e| e.to_string())?;

    *state.sync_db.lock().map_err(|e| e.to_string())? = Some(synced);
    Ok(())
}

#[tauri::command]
pub async fn clear_turso_credentials(state: State<'_, AppState>) -> Result<(), String> {
    for key in [KEYRING_URL_KEY, KEYRING_TOKEN_KEY] {
        match keyring_entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    *state.sync_db.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

/// Called from `setup()` on launch — if credentials already exist in the
/// keychain from a previous session, reconnect without the user re-entering them.
pub async fn try_restore_sync(app: &AppHandle, state: &AppState) {
    let Ok(url_entry) = keyring_entry(KEYRING_URL_KEY) else { return };
    let Ok(token_entry) = keyring_entry(KEYRING_TOKEN_KEY) else { return };
    let (Ok(db_url), Ok(auth_token)) = (url_entry.get_password(), token_entry.get_password()) else {
        return;
    };

    match db::open_synced(app, &db_url, &auth_token).await {
        Ok(synced) => {
            if let Ok(mut guard) = state.sync_db.lock() {
                *guard = Some(synced);
            }
        }
        Err(e) => eprintln!("failed to restore Turso sync on launch: {e}"),
    }
}
