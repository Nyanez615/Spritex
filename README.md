# Spritex

An authoritative, all-generations Pokémon collection and shiny-hunting companion app for
macOS, Windows, Linux, iOS, and Android — built from a single Tauri v2 + Rust + React
codebase.

> Spritex is an unofficial, fan-made project. It is not affiliated with, endorsed by, or
> sponsored by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company. Pokémon and
> Pokémon character names are trademarks of Nintendo/Game Freak/Creatures Inc.

## What it does

- Tracks your personal Pokémon collection and shiny-hunt progress (encounter counters,
  hunt checklist, caught status) — synced automatically across your own devices via
  Turso/libSQL, never shared with anyone else
- Surfaces every documented shiny-hunting method for every species across every game it
  appears in (not just the best one), with the optimal method called out visually
- Species/availability/odds data is fully automated — scraped and derived from PokéAPI
  and Bulbapedia at build time, never hand-typed (see [docs/](docs/) for the pipeline)

## Tech stack

Tauri v2 · Rust (`rusqlite`, `libsql`, `keyring`, `ts-rs`, `tokio`) · React 19 + React
Compiler · TypeScript (strict) · Vite 8 (Rolldown) · Tailwind v4 + shadcn/ui · TanStack
Router/Query/Table/Virtual

## Dev setup

```bash
# Prerequisites: Rust (rustup), Node 24+
npm install
npm run tauri dev      # Vite HMR + native Tauri window
```

From `src-tauri/`:

```bash
cargo test                            # regenerates src/lib/bindings/*.ts
cargo clippy --all-targets -- -D warnings
```

From the project root:

```bash
npx tsc --noEmit
```

## License

[Business Source License 1.1](LICENSE) — personal, non-commercial use is freely permitted.
Converts to Apache 2.0 four years after each release.

## Renaming

If this project's name ever changes, see [docs/RENAMING.md](docs/RENAMING.md) for the
full checklist of what to update (and what to deliberately leave alone).
