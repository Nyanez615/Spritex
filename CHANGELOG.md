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
- `tools/seed-gen/` — fully automated PokéAPI + Bulbapedia scraping/derivation pipeline (`npm run seed-gen`), replacing the placeholder seed row with real data: 1025 species + regional forms, 22,174 shiny-hunting method rows
- Live availability scrape of Bulbapedia's per-species "Game locations" tables, the shiny-lock exclusion list, and dedicated roster pages for Dynamax Adventures (SwSh) and Friend Safari (Gen6 X/Y)
- Shiny odds for every supported mechanic (Masuda Method, Pokéradar, chain fishing, DexNav, SOS chains, Catch Combo, Mass/Massive Mass Outbreaks, Dynamax Adventures, Friend Safari, Brilliant Pokémon) derived from Bulbapedia's datamined figures, not estimates
- Pokémon GO is the only game intentionally out of scope (live-service rotation doesn't fit a static per-species fact)
- 19 additional per-species/per-form fields scraped from PokéAPI (color, baby status, shape, growth rate, egg groups, capture rate, base happiness, height, weight, abilities, level-100 stats computed from base stats, gender-difference sprites) plus a new evolution-chain pipeline stage for `is_final_evolution`
- Game-enum audit against Bulbapedia's full games index (not just mainline): added Legends: Z-A, Colosseum, XD, Pokémon Ranger/Shadows of Almia/Guardian Signs, Dream World, and Dream Radar, each with researched-not-guessed odds; Colosseum and XD have opposite Shiny rules for Shadow Pokémon (confirmed via Bulbapedia's own Shiny Pokémon article) and are modeled accordingly

**Data layer**
- Static reference schema (`pokemon`, `shiny_methods`) bundled read-only as a Tauri resource — identical for every install, never synced
- Synced schema (`collection`) — personal hunt progress, UUID PK + soft-delete pattern, applied against a libSQL embedded replica
- `Game` (28 variants) and `Method` (19 variants) enums with stable string serialization for SQLite storage, kept in sync with their serde/TS wire format

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

**UI — all 9 views**
- Pokédex (`/`) — virtualized grid (cards never distort, only visible rows render), dex-numbered, multi-form species grouped behind a mobile-friendly tap/hover Popover preview, type-colored card strips, a toolbar organized into 4 labeled regions (Search & Sort with an independent sort-field + sort-direction control, Appearance, Classification, Abilities) backed by 8 filter facets, all state URL-persisted
- Pokémon detail page (`/pokemon/:id`) — sprite/shiny sprite plus gender-difference sprites when the species has them, a full species profile (types with official color badges, gender rate, height, weight, color, shape, growth rate, egg groups, capture rate, base happiness, abilities), level-100 stat bars, every shiny method for the species ranked best→worst with odds/boosts/citations and a transfer-required tooltip, plus a collection panel (status, +1/+10/+100 counter, shiny-charm/sandwich/outbreak checklist, mark-as-caught dialog)
- Data table (`/table`) — sortable/filterable cross-species view scoped to one game at a time (TanStack Table)
- Browse-by-game (`/games/:gameId`) — card grid of everything huntable in a given game
- Hunt dashboard (`/hunt`) — every active hunt with inline counters and checklist toggles
- Living Dex (`/dex`) — shiny-caught progress bars grouped by generation or type
- Quick Counter (`/quick-counter`) — large-tap-target counter, click between active hunts
- Settings (`/settings`) — Turso sync setup (connect/force-sync/clear credentials) and PokéAPI/Bulbapedia CC-BY-NC-SA credits
- Timeline (`/timeline`) — placeholder; the GO Community Day/Mass Outbreak calendar needs its own read model (Phase D), not built yet
- Shared left-sidebar navigation and a ⌘K command palette (live Pokémon search + view jumps)

### Fixed

- `getPokemonDetail` was missing the `isTauri()` browser-preview guard every other `lib/tauri.ts` wrapper has — it now rejects with a clear message instead of calling `invoke()` outside Tauri
- ⌘K crashed on open — `CommandDialog` never wrapped its children in cmdk's own `<Command>` context provider, so any `CommandInput`/`CommandItem` inside threw on `undefined.subscribe()`
- A 2-line-wrapped Pokémon name (e.g. "Galarian Rapidash") could overflow the Pokédex grid's fixed per-row height and get clipped by the next row — switched to TanStack Virtual's dynamic per-row measurement

### Notes

`.github/workflows/` CI and a frontend test runner aren't set up yet.
