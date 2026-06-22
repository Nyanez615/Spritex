# Privacy Policy

**Last updated:** 2026-06-22

## Summary

Spritex is a personal collection tracker. The only data that ever leaves your device is
the hunt-progress data **you** choose to sync, to a Turso database **you** create and
control. Nothing is sent to Spritex's developer or to any analytics service.

## What Spritex does NOT do

- Does not collect, upload, or transmit any data to the developer
- Does not include advertising, analytics, or tracking of any kind
- Does not identify you personally
- Does not share your data with any third party other than the sync backend you configure

## Data stored locally

Spritex stores the following data **only on your device**, in your system's application
data directory:

- Species, availability, and shiny-odds reference data (bundled with the app, identical
  for every install, contains no personal information)
- Your collection/hunt progress (status, encounter counters, checklist, caught history)
- Your Turso database URL and auth token, in your OS's secure keychain — never written
  to a plain file

## Third-party services

**PokéAPI and Bulbapedia** — used only at build time, by the developer, to generate the
bundled reference database. Your device never contacts these services at runtime.

**Turso** (turso.tech) — if you configure sync (Settings), your collection/hunt progress
is sent to **a database you created under your own Turso account**. Spritex's developer
has no access to it. See [Turso's privacy policy](https://turso.tech/privacy) for how
they handle data you store there. Declining to configure sync means no network request
of any kind is made by the app.

## Contact

For privacy questions, contact: n.yanez615@gmail.com
