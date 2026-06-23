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
- Pokémon detail page (`/pokemon/:id`) — sprite/shiny sprite plus gender-difference sprites when the species has them, click any sprite to open a swipeable/keyboard-navigable gallery across all variants; a full species profile (types with official color badges, gender rate, height, weight, color, shape, growth rate, egg groups, capture rate, base happiness, abilities); level-100 stat bars with an optional Customize panel (level/nature/IVs/EVs/held item/ability stat simulator, defaults unchanged at lv100/neutral/max IVs); every shiny method for the species ranked best→worst with odds/boosts/citations and a transfer-required tooltip; plus a collection panel (status, +1/+10/+100 counter, shiny-charm/sandwich/outbreak checklist, mark-as-caught dialog) shown once Turso sync is configured
- Data table (`/table`) — sortable/filterable cross-species view scoped to one game at a time (TanStack Table)
- Browse-by-game (`/games/:gameId`) — card grid of everything huntable in a given game
- Hunt dashboard (`/hunt`) — every active hunt with inline counters and checklist toggles
- Living Dex (`/dex`) — shiny-caught progress bars grouped by generation or type
- Quick Counter (`/quick-counter`) — large-tap-target counter, click between active hunts
- Settings (`/settings`) — Turso sync setup (connect/force-sync/clear credentials) and PokéAPI/Bulbapedia CC-BY-NC-SA credits
- Timeline (`/timeline`) — placeholder; the GO Community Day/Mass Outbreak calendar needs its own read model (Phase D), not built yet
- Shared left-sidebar navigation and a ⌘K command palette (live Pokémon search + view jumps)
- Every collection/hunt-dependent view (`/pokemon/:id`, `/hunt`, `/dex`, `/quick-counter`, `/`) now distinguishes "sync isn't configured" from "no data yet," via a shared `useSyncStatus`/`SyncRequiredNotice`/`RequireSync` set of helpers, instead of silently rendering an empty state either way

**Testing**
- Rust: every command across `pokedex.rs`/`methods.rs`/`collection.rs`/`hunt.rs`/`sync_cmds.rs` split into a thin `#[tauri::command]` wrapper plus a directly-testable `_impl` function (`tauri::State` has no public test constructor), with in-memory rusqlite tests for the static-data commands and local-mode libsql tests for the synced ones; full `Game`/`Method`/`CollectionStatus` enum round-trip coverage
- Frontend: Vitest + React Testing Library + jsdom, 13 test files covering `lib/` utilities, the `lib/tauri.ts` wrapper boundary, hooks, `FilterBar`, a ⌘K regression test, and key route logic
- `.github/workflows/ci.yml` — clippy + `cargo test` (macOS) and `tsc --noEmit` + `npm run test:run` (Ubuntu/Node 24) on every push/PR

### Fixed

- `getPokemonDetail` was missing the `isTauri()` browser-preview guard every other `lib/tauri.ts` wrapper has — it now rejects with a clear message instead of calling `invoke()` outside Tauri
- ⌘K crashed on open — `CommandDialog` never wrapped its children in cmdk's own `<Command>` context provider, so any `CommandInput`/`CommandItem` inside threw on `undefined.subscribe()`
- A 2-line-wrapped Pokémon name (e.g. "Galarian Rapidash") could overflow the Pokédex grid's fixed per-row height and get clipped by the next row — switched to TanStack Virtual's dynamic per-row measurement
- Wild-encounter-only shiny methods (Pokéradar chaining, chain fishing, DexNav, SOS, Catch Combo, Mass Outbreak, Brilliant Pokémon) were showing up for species only obtainable via a one-time NPC gift, a static "(Only one)" encounter, a trade, an evolution, or a hatch — confirmed against live Bulbapedia wikitext, affecting an estimated 300+ rows (every X/Y Kanto-starter gift, the Sinnoh lake trio, Manaphy in Legends: Arceus, and — caught in a follow-up review pass — every generation's own starter trio in its home game, plus a plain-text "Traded from" phrasing missed by the trade-link check); the baseline Wild method row is unaffected, since the shiny roll itself doesn't care how a Pokémon was obtained
- The Pokémon detail page rendered two dividers back-to-back with nothing real between them whenever Turso sync wasn't configured — the collection panel was silently not rendering at all, with no indication why; now shows a single divider followed by either the real panel or a clear "set up sync" message
- "Shiny methods" heading text-cased incorrectly ("Shiny Methods")
- The detail page's collection-entry query had no `enabled` gate, so it kept retrying against a backend that was always going to reject it while sync was unconfigured
- The stat simulator's Ability dropdown rendered the raw "Huge_power"/"Pure_power" enum keys instead of "Huge Power"/"Pure Power" — the shared `humanize()` helper only splits slug text on hyphens, not underscores
- The stat simulator's inputs and the sprite gallery's open variant didn't reset when navigating from one Pokémon's detail page to another (TanStack Router reuses the route component across param changes) — a held item chosen for one species could silently carry over onto an unrelated one
- TanStack Router's file-based route scanner was treating co-located `*.test.tsx` files under `src/routes/` as candidate routes, producing spurious warnings — excluded via `routeFileIgnorePattern`
