mod commands;
mod db;
mod models;

use db::AppState;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            let static_db = db::open_static(app.handle())
                .expect("failed to open bundled static.db — run tools/seed-gen/build-static-db.ts");

            let state = AppState {
                static_db: Arc::new(Mutex::new(static_db)),
                sync_db: Arc::new(Mutex::new(None)),
            };
            app.manage(state);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<AppState>();
                commands::sync_cmds::try_restore_sync(&handle, &state).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pokedex::get_pokemon_list,
            commands::pokedex::get_pokemon_detail,
            commands::pokedex::search_pokemon,
            commands::methods::get_methods_for_pokemon,
            commands::methods::get_methods_for_game,
            commands::methods::get_best_method,
            commands::collection::get_collection_entry,
            commands::collection::update_status,
            commands::collection::mark_caught,
            commands::collection::reset_hunt,
            commands::collection::get_living_dex_stats,
            commands::collection::get_all_collection_entries,
            commands::hunt::increment_counter,
            commands::hunt::toggle_checklist,
            commands::hunt::get_active_hunts,
            commands::sync_cmds::get_sync_status,
            commands::sync_cmds::force_sync,
            commands::sync_cmds::set_turso_credentials,
            commands::sync_cmds::clear_turso_credentials,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
