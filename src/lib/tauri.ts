/**
 * Typed wrappers around Tauri invoke(). Import from here — never call
 * invoke() directly in components. Every function returns a safe default
 * when running outside the Tauri WebView (e.g. the Vite browser preview)
 * so the UI can be developed without a native window.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";
import type { Pokemon } from "./bindings/Pokemon";
import type { PokedexFilters } from "./bindings/PokedexFilters";
import type { ShinyMethod } from "./bindings/ShinyMethod";
import type { Game } from "./bindings/Game";
import type { Method } from "./bindings/Method";
import type { CollectionEntry } from "./bindings/CollectionEntry";
import type { CollectionStatus } from "./bindings/CollectionStatus";
import type { ChecklistField } from "./bindings/ChecklistField";
import type { DexGroupBy } from "./bindings/DexGroupBy";
import type { DexProgressBucket } from "./bindings/DexProgressBucket";
import type { SyncStatus } from "./bindings/SyncStatus";
import type { SyncMode } from "./bindings/SyncMode";
import type { CosmeticForm } from "./bindings/CosmeticForm";

export type {
  Pokemon,
  PokedexFilters,
  ShinyMethod,
  Game,
  Method,
  CollectionEntry,
  CollectionStatus,
  ChecklistField,
  DexGroupBy,
  DexProgressBucket,
  SyncStatus,
  SyncMode,
  CosmeticForm,
};

// ── Defaults for browser-preview mode ────────────────────────────────────────

const DEFAULT_SYNC_STATUS: SyncStatus = {
  last_synced_at: null,
  is_online: false,
  mode: "unconfigured",
};

const defaultCollectionEntry = (pokemon_id: number, form_id: number): CollectionEntry => ({
  id: "",
  pokemon_id,
  form_id,
  status: "not_started",
  is_shiny: false,
  encounter_count: 0,
  has_shiny_charm: false,
  sandwich_active: false,
  outbreak_active: false,
  chain_count: 0,
  game_caught: null,
  method_used: null,
  caught_at: null,
  notes: null,
  updated_at: "",
  synced_at: null,
});

// ── Pokedex ───────────────────────────────────────────────────────────────────

export const getPokemonList = (filters: PokedexFilters): Promise<Pokemon[]> =>
  isTauri() ? invoke("get_pokemon_list", { filters }) : Promise.resolve([]);

export const getPokemonDetail = (pokemonId: number, formId: number): Promise<Pokemon> =>
  isTauri()
    ? invoke("get_pokemon_detail", { pokemonId, formId })
    : Promise.reject(new Error("Pokémon detail unavailable in browser preview (no Tauri backend)"));

export const searchPokemon = (query: string): Promise<Pokemon[]> =>
  isTauri() ? invoke("search_pokemon", { query }) : Promise.resolve([]);

// ── Shiny methods ─────────────────────────────────────────────────────────────

export const getMethodsForPokemon = (
  pokemonId: number,
  formId: number,
): Promise<ShinyMethod[]> =>
  isTauri() ? invoke("get_methods_for_pokemon", { pokemonId, formId }) : Promise.resolve([]);

export const getMethodsForGame = (game: Game): Promise<ShinyMethod[]> =>
  isTauri() ? invoke("get_methods_for_game", { game }) : Promise.resolve([]);

export const getBestMethod = (
  pokemonId: number,
  formId: number,
): Promise<ShinyMethod | null> =>
  isTauri() ? invoke("get_best_method", { pokemonId, formId }) : Promise.resolve(null);

/** Mega/Gigantamax sprite variants + (mega only) the required held item, for the sprite gallery. */
export const getCosmeticForms = (
  pokemonId: number,
  formId: number,
): Promise<CosmeticForm[]> =>
  isTauri() ? invoke("get_cosmetic_forms", { pokemonId, formId }) : Promise.resolve([]);

// ── Collection ────────────────────────────────────────────────────────────────

export const getCollectionEntry = (
  pokemonId: number,
  formId: number,
): Promise<CollectionEntry> =>
  isTauri()
    ? invoke("get_collection_entry", { pokemonId, formId })
    : Promise.resolve(defaultCollectionEntry(pokemonId, formId));

export const updateStatus = (
  pokemonId: number,
  formId: number,
  status: CollectionStatus,
): Promise<CollectionEntry> =>
  isTauri()
    ? invoke("update_status", { pokemonId, formId, status })
    : Promise.resolve({ ...defaultCollectionEntry(pokemonId, formId), status });

export const markCaught = (
  pokemonId: number,
  formId: number,
  isShiny: boolean,
  gameCaught: Game,
  methodUsed: Method,
): Promise<CollectionEntry> =>
  isTauri()
    ? invoke("mark_caught", { pokemonId, formId, isShiny, gameCaught, methodUsed })
    : Promise.resolve({
        ...defaultCollectionEntry(pokemonId, formId),
        status: "caught" as CollectionStatus,
        is_shiny: isShiny,
        game_caught: gameCaught,
        method_used: methodUsed,
      });

export const resetHunt = (pokemonId: number, formId: number): Promise<CollectionEntry> =>
  isTauri()
    ? invoke("reset_hunt", { pokemonId, formId })
    : Promise.resolve(defaultCollectionEntry(pokemonId, formId));

export const getLivingDexStats = (groupBy: DexGroupBy): Promise<DexProgressBucket[]> =>
  isTauri() ? invoke("get_living_dex_stats", { groupBy }) : Promise.resolve([]);

export const getAllCollectionEntries = (): Promise<CollectionEntry[]> =>
  isTauri() ? invoke("get_all_collection_entries") : Promise.resolve([]);

// ── Hunt ──────────────────────────────────────────────────────────────────────

export const incrementCounter = (
  pokemonId: number,
  formId: number,
  amount: 1 | 10 | 100,
): Promise<CollectionEntry> =>
  isTauri()
    ? invoke("increment_counter", { pokemonId, formId, amount })
    : Promise.resolve({
        ...defaultCollectionEntry(pokemonId, formId),
        status: "hunting" as CollectionStatus,
        encounter_count: amount,
      });

export const toggleChecklist = (
  pokemonId: number,
  formId: number,
  field: ChecklistField,
  value: boolean,
): Promise<CollectionEntry> =>
  isTauri()
    ? invoke("toggle_checklist", { pokemonId, formId, field, value })
    : Promise.resolve(defaultCollectionEntry(pokemonId, formId));

export const getActiveHunts = (): Promise<CollectionEntry[]> =>
  isTauri() ? invoke("get_active_hunts") : Promise.resolve([]);

// ── Sync ──────────────────────────────────────────────────────────────────────

export const getSyncStatus = (): Promise<SyncStatus> =>
  isTauri() ? invoke("get_sync_status") : Promise.resolve(DEFAULT_SYNC_STATUS);

export const forceSync = (): Promise<SyncStatus> =>
  isTauri() ? invoke("force_sync") : Promise.resolve(DEFAULT_SYNC_STATUS);

export const setTursoCredentials = (dbUrl: string, authToken: string): Promise<void> =>
  isTauri() ? invoke("set_turso_credentials", { dbUrl, authToken }) : Promise.resolve();

export const clearTursoCredentials = (): Promise<void> =>
  isTauri() ? invoke("clear_turso_credentials") : Promise.resolve();
