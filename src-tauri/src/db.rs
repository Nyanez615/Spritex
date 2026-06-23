use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{path::BaseDirectory, AppHandle, Manager};

/// `Database` is the libsql handle `.sync()` lives on; `Connection` is what
/// queries run against. Both are kept together because `force_sync` needs the
/// former and every other command needs the latter.
#[derive(Clone)]
pub struct SyncedDb {
    pub db: Arc<libsql::Database>,
    pub conn: libsql::Connection,
}

/// Static reference data (pokemon, shiny_methods) — bundled at build time by
/// tools/seed-gen/, identical for every install, never synced, never migrated
/// at runtime. `sync_db` is `None` until `set_turso_credentials` configures it.
/// Both fields are `Arc<Mutex<_>>` because `rusqlite::Connection` and the
/// libsql connection aren't `Sync` on their own, and Tauri's managed `State<T>`
/// requires `AppState: Send + Sync` to hand out across concurrent command calls.
pub struct AppState {
    pub static_db: Arc<Mutex<Connection>>,
    pub sync_db: Arc<Mutex<Option<SyncedDb>>>,
}

const SYNCED_MIGRATIONS: &[(&str, &str)] = &[(
    "001_collection",
    include_str!("../migrations/synced/001_collection.sql"),
)];

pub fn open_static(app: &AppHandle) -> rusqlite::Result<Connection> {
    let resource_path = app
        .path()
        .resolve("resources/static.db", BaseDirectory::Resource)
        .expect("failed to resolve resources/static.db — run tools/seed-gen/build-static-db.ts first");
    open_static_at(&resource_path)
}

fn open_static_at(path: &Path) -> rusqlite::Result<Connection> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
}

/// Opens (or creates) the local libSQL embedded replica and syncs it against
/// Turso Cloud. Call after `set_turso_credentials` has stored a token, or on
/// launch if credentials already exist in the keychain.
pub async fn open_synced(
    app: &AppHandle,
    turso_db_url: &str,
    turso_auth_token: &str,
) -> Result<SyncedDb, libsql::Error> {
    let local_path = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app_data_dir")
        .join("collection.db");

    let db = libsql::Builder::new_remote_replica(local_path, turso_db_url.to_string(), turso_auth_token.to_string())
        .sync_interval(std::time::Duration::from_secs(300))
        .build()
        .await?;

    let conn = db.connect()?;
    run_synced_migrations(&conn).await?;
    Ok(SyncedDb {
        db: Arc::new(db),
        conn,
    })
}

pub(crate) async fn run_synced_migrations(conn: &libsql::Connection) -> Result<(), libsql::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))",
        (),
    )
    .await?;

    for (name, sql) in SYNCED_MIGRATIONS {
        let mut rows = conn
            .query("SELECT 1 FROM _migrations WHERE name = ?1", [*name])
            .await?;
        if rows.next().await?.is_some() {
            continue;
        }
        conn.execute_batch(sql).await?;
        conn.execute("INSERT INTO _migrations (name) VALUES (?1)", [*name])
            .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_db_opens_read_only() {
        // A read-only open against a nonexistent path should fail, not silently
        // create a writable file — confirms OpenFlags::SQLITE_OPEN_READ_ONLY is wired.
        let result = open_static_at(Path::new("/tmp/spritex-test-nonexistent.db"));
        assert!(result.is_err());
    }
}
