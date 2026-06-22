# Renaming this project

The project name appears in two distinct categories. Knowing which is which means a
rename only ever touches the second category — the first is internal plumbing that
can stay as-is even if the brand name changes.

## 1. Technical identifiers — lowercase by ecosystem convention, safe to leave alone

These follow npm/Cargo/reverse-domain conventions that require (or strongly expect)
lowercase, and nothing user-facing reads them directly. **Leave these as `spritex`
unless you are deliberately renaming the underlying package/repo, not just the brand:**

| Location | Field |
|---|---|
| `package.json` | `name` — npm **enforces** lowercase package names |
| `package-lock.json` | mirrors `package.json`, regenerates on `npm install` |
| `src-tauri/Cargo.toml` | `[package] name`, `[lib] name` (`spritex_lib`) |
| `src-tauri/tauri.conf.json` | `identifier` (`com.spritex.app` — reverse-domain bundle ID convention) |
| `src-tauri/src/main.rs` | `spritex_lib::run()` — must match `[lib] name` exactly |
| `src-tauri/src/commands/sync_cmds.rs` | `KEYRING_SERVICE` — derived from `env!("CARGO_PKG_NAME")`, not hardcoded; follows `Cargo.toml`'s `name` automatically |

## 2. Display name — update these on a brand rename

Everything a human actually sees. Update all of these together:

| Location | Field |
|---|---|
| `src/lib/constants.ts` | `APP_NAME` — reference this from any new UI instead of hardcoding the name |
| `index.html` | `<title>` |
| `src-tauri/tauri.conf.json` | `productName`, `app.windows[0].title` |
| `src-tauri/Cargo.toml` | `description` |
| `README.md` | title and body |
| `LICENSE` | `Licensed Work:` field, footer URL |
| `CHANGELOG.md` | intro line ("changes to Spritex") |
| `PRIVACY.md` | intro line |
| GitHub repository name | rename via repo Settings, GitHub auto-redirects the old URL |
| `src-tauri/tauri.conf.json` | `plugins.updater.endpoints` — must match the GitHub repo name exactly (case-sensitive in the URL path) |

## What does NOT need a new signing keypair

The Tauri updater keypair (`~/.tauri/spritex.key` + `.pub`, outside the repo) is tied
to the *update channel*, not the brand name. A display-name rename does not require
regenerating it — only the `pubkey`/`endpoints` in `tauri.conf.json` need to keep
matching the actual GitHub repo.
