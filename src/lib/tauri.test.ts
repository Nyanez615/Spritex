import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";
import * as tauriLib from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./env", () => ({ isTauri: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const mockedIsTauri = vi.mocked(isTauri);

beforeEach(() => {
  vi.clearAllMocks();
});

const FILTERS = { search: null, generation: null, legendary_or_mythical_only: null };

describe("Pokedex", () => {
  it("getPokemonList invokes get_pokemon_list in Tauri mode", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(["RESULT"]);
    const result = await tauriLib.getPokemonList(FILTERS);
    expect(invoke).toHaveBeenCalledWith("get_pokemon_list", { filters: FILTERS });
    expect(result).toEqual(["RESULT"]);
  });

  it("getPokemonList returns [] without invoking, in browser preview", async () => {
    mockedIsTauri.mockReturnValue(false);
    const result = await tauriLib.getPokemonList(FILTERS);
    expect(invoke).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("getPokemonDetail invokes get_pokemon_detail in Tauri mode", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ id: 1 });
    const result = await tauriLib.getPokemonDetail(1, 0);
    expect(invoke).toHaveBeenCalledWith("get_pokemon_detail", { pokemonId: 1, formId: 0 });
    expect(result).toEqual({ id: 1 });
  });

  it("getPokemonDetail rejects (not a silent default) in browser preview — a real bug fixed earlier in this project", async () => {
    mockedIsTauri.mockReturnValue(false);
    await expect(tauriLib.getPokemonDetail(1, 0)).rejects.toThrow(/unavailable in browser preview/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("searchPokemon invokes search_pokemon in Tauri mode, [] in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(["RESULT"]);
    expect(await tauriLib.searchPokemon("char")).toEqual(["RESULT"]);
    expect(invoke).toHaveBeenCalledWith("search_pokemon", { query: "char" });

    mockedIsTauri.mockReturnValue(false);
    expect(await tauriLib.searchPokemon("char")).toEqual([]);
  });
});

describe("Shiny methods", () => {
  it("getMethodsForPokemon invokes get_methods_for_pokemon in Tauri mode, [] in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(["RESULT"]);
    expect(await tauriLib.getMethodsForPokemon(1, 0)).toEqual(["RESULT"]);
    expect(invoke).toHaveBeenCalledWith("get_methods_for_pokemon", { pokemonId: 1, formId: 0 });

    mockedIsTauri.mockReturnValue(false);
    expect(await tauriLib.getMethodsForPokemon(1, 0)).toEqual([]);
  });

  it("getMethodsForGame invokes get_methods_for_game in Tauri mode, [] in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(["RESULT"]);
    expect(await tauriLib.getMethodsForGame("sv")).toEqual(["RESULT"]);
    expect(invoke).toHaveBeenCalledWith("get_methods_for_game", { game: "sv" });

    mockedIsTauri.mockReturnValue(false);
    expect(await tauriLib.getMethodsForGame("sv")).toEqual([]);
  });

  it("getBestMethod invokes get_best_method in Tauri mode, null in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ id: 1 });
    expect(await tauriLib.getBestMethod(1, 0)).toEqual({ id: 1 });
    expect(invoke).toHaveBeenCalledWith("get_best_method", { pokemonId: 1, formId: 0 });

    mockedIsTauri.mockReturnValue(false);
    expect(await tauriLib.getBestMethod(1, 0)).toBeNull();
  });
});

describe("Collection", () => {
  it("getCollectionEntry invokes get_collection_entry in Tauri mode, a default NotStarted entry in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ status: "hunting" });
    expect(await tauriLib.getCollectionEntry(1, 0)).toEqual({ status: "hunting" });
    expect(invoke).toHaveBeenCalledWith("get_collection_entry", { pokemonId: 1, formId: 0 });

    mockedIsTauri.mockReturnValue(false);
    const preview = await tauriLib.getCollectionEntry(1, 0);
    expect(preview.status).toBe("not_started");
    expect(preview.pokemon_id).toBe(1);
    expect(preview.form_id).toBe(0);
  });

  it("updateStatus invokes update_status in Tauri mode, a locally-constructed entry with the new status in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ status: "caught" });
    expect(await tauriLib.updateStatus(1, 0, "caught")).toEqual({ status: "caught" });
    expect(invoke).toHaveBeenCalledWith("update_status", { pokemonId: 1, formId: 0, status: "caught" });

    mockedIsTauri.mockReturnValue(false);
    const preview = await tauriLib.updateStatus(1, 0, "hunting");
    expect(preview.status).toBe("hunting");
  });

  it("markCaught invokes mark_caught in Tauri mode, a locally-constructed caught entry in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ status: "caught", is_shiny: true });
    expect(await tauriLib.markCaught(1, 0, true, "sv", "outbreak")).toEqual({ status: "caught", is_shiny: true });
    expect(invoke).toHaveBeenCalledWith("mark_caught", {
      pokemonId: 1,
      formId: 0,
      isShiny: true,
      gameCaught: "sv",
      methodUsed: "outbreak",
    });

    mockedIsTauri.mockReturnValue(false);
    const preview = await tauriLib.markCaught(1, 0, true, "sv", "outbreak");
    expect(preview.status).toBe("caught");
    expect(preview.is_shiny).toBe(true);
    expect(preview.game_caught).toBe("sv");
    expect(preview.method_used).toBe("outbreak");
  });

  it("resetHunt invokes reset_hunt in Tauri mode, a default entry in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ status: "not_started" });
    expect(await tauriLib.resetHunt(1, 0)).toEqual({ status: "not_started" });
    expect(invoke).toHaveBeenCalledWith("reset_hunt", { pokemonId: 1, formId: 0 });

    mockedIsTauri.mockReturnValue(false);
    const preview = await tauriLib.resetHunt(1, 0);
    expect(preview.status).toBe("not_started");
    expect(preview.encounter_count).toBe(0);
  });

  it("getLivingDexStats invokes get_living_dex_stats in Tauri mode, [] in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(["RESULT"]);
    expect(await tauriLib.getLivingDexStats("generation")).toEqual(["RESULT"]);
    expect(invoke).toHaveBeenCalledWith("get_living_dex_stats", { groupBy: "generation" });

    mockedIsTauri.mockReturnValue(false);
    expect(await tauriLib.getLivingDexStats("generation")).toEqual([]);
  });

  it("getAllCollectionEntries invokes get_all_collection_entries (no params) in Tauri mode, [] in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(["RESULT"]);
    expect(await tauriLib.getAllCollectionEntries()).toEqual(["RESULT"]);
    expect(invoke).toHaveBeenCalledWith("get_all_collection_entries");

    mockedIsTauri.mockReturnValue(false);
    expect(await tauriLib.getAllCollectionEntries()).toEqual([]);
  });
});

describe("Hunt", () => {
  it("incrementCounter invokes increment_counter in Tauri mode, a hunting entry with encounter_count=amount in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ encounter_count: 10 });
    expect(await tauriLib.incrementCounter(1, 0, 10)).toEqual({ encounter_count: 10 });
    expect(invoke).toHaveBeenCalledWith("increment_counter", { pokemonId: 1, formId: 0, amount: 10 });

    mockedIsTauri.mockReturnValue(false);
    const preview = await tauriLib.incrementCounter(1, 0, 10);
    expect(preview.status).toBe("hunting");
    expect(preview.encounter_count).toBe(10);
  });

  it("toggleChecklist invokes toggle_checklist in Tauri mode, a default entry in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ has_shiny_charm: true });
    expect(await tauriLib.toggleChecklist(1, 0, "has_shiny_charm", true)).toEqual({ has_shiny_charm: true });
    expect(invoke).toHaveBeenCalledWith("toggle_checklist", {
      pokemonId: 1,
      formId: 0,
      field: "has_shiny_charm",
      value: true,
    });

    mockedIsTauri.mockReturnValue(false);
    expect((await tauriLib.toggleChecklist(1, 0, "has_shiny_charm", true)).has_shiny_charm).toBe(false);
  });

  it("getActiveHunts invokes get_active_hunts (no params) in Tauri mode, [] in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(["RESULT"]);
    expect(await tauriLib.getActiveHunts()).toEqual(["RESULT"]);
    expect(invoke).toHaveBeenCalledWith("get_active_hunts");

    mockedIsTauri.mockReturnValue(false);
    expect(await tauriLib.getActiveHunts()).toEqual([]);
  });
});

describe("Sync", () => {
  it("getSyncStatus invokes get_sync_status in Tauri mode, the unconfigured default in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ mode: "embedded_replica" });
    expect(await tauriLib.getSyncStatus()).toEqual({ mode: "embedded_replica" });
    expect(invoke).toHaveBeenCalledWith("get_sync_status");

    mockedIsTauri.mockReturnValue(false);
    const preview = await tauriLib.getSyncStatus();
    expect(preview.mode).toBe("unconfigured");
    expect(preview.is_online).toBe(false);
  });

  it("forceSync invokes force_sync in Tauri mode, the unconfigured default in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({ mode: "embedded_replica" });
    expect(await tauriLib.forceSync()).toEqual({ mode: "embedded_replica" });
    expect(invoke).toHaveBeenCalledWith("force_sync");

    mockedIsTauri.mockReturnValue(false);
    expect((await tauriLib.forceSync()).mode).toBe("unconfigured");
  });

  it("setTursoCredentials invokes set_turso_credentials in Tauri mode, resolves in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(undefined);
    await tauriLib.setTursoCredentials("libsql://db", "token");
    expect(invoke).toHaveBeenCalledWith("set_turso_credentials", { dbUrl: "libsql://db", authToken: "token" });

    mockedIsTauri.mockReturnValue(false);
    await expect(tauriLib.setTursoCredentials("libsql://db", "token")).resolves.toBeUndefined();
  });

  it("clearTursoCredentials invokes clear_turso_credentials (no params) in Tauri mode, resolves in preview", async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue(undefined);
    await tauriLib.clearTursoCredentials();
    expect(invoke).toHaveBeenCalledWith("clear_turso_credentials");

    mockedIsTauri.mockReturnValue(false);
    await expect(tauriLib.clearTursoCredentials()).resolves.toBeUndefined();
  });
});
