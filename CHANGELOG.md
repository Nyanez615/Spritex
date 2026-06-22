# Changelog

All notable changes to Spritex are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

**Foundation**
- Tauri v2 + React 19 + TypeScript (strict) scaffold, upgraded to Vite 8 (Rolldown-powered bundler)
- Tailwind v4 + shadcn/ui (Nova preset, Radix base), dark theme by default
- TanStack Router (file-based), TanStack Query, TanStack Table, TanStack Virtual, Zustand, cmdk

**Data layer**
- Static reference schema (`pokemon`, `shiny_methods`) bundled read-only as a Tauri resource — identical for every install, never synced
- Synced schema (`collection`) — personal hunt progress, UUID PK + soft-delete pattern, applied against a libSQL embedded replica
- `Game` (20 variants) and `Method` (17 variants) enums with stable string serialization for SQLite storage, kept in sync with their serde/TS wire format

**Rust command layer**
- `commands/pokedex.rs` — `get_pokemon_list`, `get_pokemon_detail`, `search_pokemon`
- `commands/methods.rs` — `get_methods_for_pokemon`, `get_methods_for_game`, `get_best_method`
- `commands/collection.rs` — `get_collection_entry`, `update_status`, `mark_caught`, `reset_hunt`, `get_living_dex_stats`
- `commands/hunt.rs` — `increment_counter` (server-validated to 1/10/100), `toggle_checklist`, `get_active_hunts`
- `commands/sync_cmds.rs` — `get_sync_status`, `force_sync`, `set_turso_credentials`, `clear_turso_credentials`, with credentials in the OS keychain (never on disk)
- `ts-rs` TypeScript bindings generated for every model, canonical copy in `src/lib/bindings/`
- `lib/tauri.ts` typed `invoke()` wrappers with browser-safe defaults for every command

**Project setup**
- Tauri updater plugin configured with a real signing keypair (no paid code-signing — desktop builds ship unsigned, matching the mobile free-provisioning posture)
- BSL-1.1 license, fan-made disclaimer, and a renaming checklist (`docs/RENAMING.md`)

### Notes

No species/odds data is seeded yet — `tools/seed-gen/` (the automated PokéAPI + Bulbapedia
scraping pipeline) has not been built. A single placeholder row exists in `resources/static.db`
to exercise the command layer.
