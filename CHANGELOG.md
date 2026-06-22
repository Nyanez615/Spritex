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

**Data pipeline**
- `tools/seed-gen/` — fully automated PokéAPI + Bulbapedia scraping/derivation pipeline (`npm run seed-gen`), replacing the placeholder seed row with real data: 1025 species + regional forms, ~21,700 shiny-hunting method rows
- Live availability scrape of Bulbapedia's per-species "Game locations" tables, the shiny-lock exclusion list, and dedicated roster pages for Dynamax Adventures (SwSh) and Friend Safari (Gen6 X/Y)
- Shiny odds for every supported mechanic (Masuda Method, Pokéradar, chain fishing, DexNav, SOS chains, Catch Combo, Mass/Massive Mass Outbreaks, Dynamax Adventures, Friend Safari, Brilliant Pokémon) derived from Bulbapedia's datamined figures, not estimates
- Pokémon GO is the only game intentionally out of scope (live-service rotation doesn't fit a static per-species fact)

**Data layer**
- Static reference schema (`pokemon`, `shiny_methods`) bundled read-only as a Tauri resource — identical for every install, never synced
- Synced schema (`collection`) — personal hunt progress, UUID PK + soft-delete pattern, applied against a libSQL embedded replica
- `Game` (20 variants) and `Method` (19 variants) enums with stable string serialization for SQLite storage, kept in sync with their serde/TS wire format

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

The remaining 8 views' UI (table, games/$gameId, hunt, dex, quick-counter, settings,
timeline-stretch) aren't built yet — only `/` (the Pokédex grid) is wired to the real data.
