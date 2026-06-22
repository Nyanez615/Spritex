/**
 * Single source of truth for the app's display name. Reference this from
 * any component that needs to show the app name (window chrome, About/
 * Credits section, etc.) instead of hardcoding the string — a rename then
 * only touches this file, index.html's <title>, and tauri.conf.json's
 * productName/title (see docs/RENAMING.md for the full checklist).
 */
export const APP_NAME = "Spritex";
