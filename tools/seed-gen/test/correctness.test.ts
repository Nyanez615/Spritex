/**
 * Sanity check on the *derived* output (out/shiny-methods.json), not a unit
 * test of the parsers — per Phase A step 3: "a small automated test
 * asserting a handful of known SV values," to catch the pipeline silently
 * drifting from well-established, independently-verifiable shiny odds.
 * Requires the pipeline to have been run at least once (`npm run seed-gen`)
 * so out/shiny-methods.json exists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readOutJson } from "../src/httpCache.js";
import type { PokemonRow, ShinyMethodRow } from "../src/deriveShinyMethods.js";

async function methodsFor(pokemonId: number, formId = 0): Promise<ShinyMethodRow[]> {
  const all = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  return all.filter((m) => m.pokemon_id === pokemonId && m.form_id === formId);
}

test("Bulbasaur (#1) is SV-huntable at 1/512 via Mass Outbreak + Sparkling Power Lv.3 + Charm", async () => {
  const rows = await methodsFor(1);
  const sv = rows.find((r) => r.game === "sv" && r.method === "outbreak");
  assert.ok(sv, "expected a sv/outbreak row for Bulbasaur");
  assert.equal(sv!.odds_optimized, 512);
});

test("Gengar (#94) has BDSP Pokéradar chain-40 as its best method, at 1/94 with Charm", async () => {
  const rows = await methodsFor(94);
  const best = rows.find((r) => r.is_best_method);
  assert.ok(best, "expected exactly one is_best_method row for Gengar");
  assert.equal(best!.game, "bdsp");
  assert.equal(best!.method, "chain_radar");
  assert.equal(best!.odds_optimized, 94);
});

test("Gen6+ Masuda Method + Shiny Charm lands at 1/512", async () => {
  const rows = await methodsFor(1);
  const masuda = rows.find((r) => r.game === "gen6_xy" && r.method === "masuda");
  assert.ok(masuda);
  assert.equal(masuda!.odds_optimized, 512);
});

test("Gen7 SOS chain 31+ with Charm lands at 1/274 (Caterpie, #10)", async () => {
  const rows = await methodsFor(10);
  const sos = rows.find((r) => r.game === "gen7_sm" && r.method === "sos");
  assert.ok(sos, "expected a gen7_sm/sos row for Caterpie");
  assert.equal(sos!.odds_base, 316);
  assert.equal(sos!.odds_optimized, 274);
});

test("Dynamax Adventure roster grants Ivysaur (#2) a swsh row at 1/300 (1/100 with Charm)", async () => {
  const rows = await methodsFor(2);
  const da = rows.find((r) => r.game === "swsh" && r.method === "dynamax_adventure");
  assert.ok(da, "expected a swsh/dynamax_adventure row for Ivysaur (confirmed on the DA roster page)");
  assert.equal(da!.odds_base, 300);
  assert.equal(da!.odds_optimized, 100);
});

test("DexNav (ORAS) is modeled at 1/62 (1/36 with Charm) for an ORAS-available species", async () => {
  const all = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const dexNav = all.find((r) => r.game === "gen6_oras" && r.method === "dex_nav");
  assert.ok(dexNav, "expected at least one gen6_oras/dex_nav row");
  assert.equal(dexNav!.odds_base, 62);
  assert.equal(dexNav!.odds_optimized, 36);
});

test("Friend Safari roster grants Ditto (#132) a gen6_xy row at 1/819 (1/585 with Charm)", async () => {
  const rows = await methodsFor(132);
  const fs = rows.find((r) => r.game === "gen6_xy" && r.method === "friend_safari");
  assert.ok(fs, "expected a gen6_xy/friend_safari row for Ditto (confirmed on the Friend Safari roster page)");
  assert.equal(fs!.odds_base, 819);
  assert.equal(fs!.odds_optimized, 585);
});

test("Brilliant Pokémon (SwSh) is modeled generically for any swsh-available species", async () => {
  const rows = await methodsFor(1); // Bulbasaur — wild-available in swsh, no roster restriction
  const brilliant = rows.find((r) => r.game === "swsh" && r.method === "brilliant_pokemon");
  assert.ok(brilliant, "expected a swsh/brilliant_pokemon row for Bulbasaur");
  assert.equal(brilliant!.odds_base, 586);
  assert.equal(brilliant!.odds_optimized, 456);
});

test("Paldean Tauros's 3 breed forms are tracked as distinct pokemon rows", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const breeds = pokemon.filter((p) => p.id === 128 && p.form_name === "Paldean");
  assert.equal(breeds.length, 3, "expected Combat/Blaze/Aqua Breed as 3 separate form_ids");
  assert.deepEqual(
    new Set(breeds.map((p) => p.display_name)),
    new Set(["Paldean Tauros (Combat Breed)", "Paldean Tauros (Blaze Breed)", "Paldean Tauros (Aqua Breed)"])
  );
});

test("Paldean Tauros's breed forms each get their own SV availability (not all dumped onto the base form)", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const breeds = pokemon.filter((p) => p.id === 128 && p.form_name === "Paldean");
  for (const breed of breeds) {
    const rows = await methodsFor(128, breed.form_id);
    assert.ok(rows.some((r) => r.game === "sv"), `expected ${breed.display_name} to have sv availability`);
  }
});

test("no shiny_methods row exists for Gen 1 VC (the shiny mechanic didn't exist yet)", async () => {
  const rows = await methodsFor(1);
  assert.ok(rows.every((r) => r.game !== "gen1_vc"));
});

test("every row's odds_optimized is at least as good as (<=) its odds_base", async () => {
  const all = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  for (const r of all) {
    assert.ok(
      r.odds_optimized <= r.odds_base,
      `${r.game}/${r.method} for pokemon ${r.pokemon_id}: optimized (${r.odds_optimized}) should never be worse than base (${r.odds_base})`
    );
  }
});

test("Bulbasaur (#1) color is green and its level-100 stats match the confirmed formula (max neutral IV, 0 EV, neutral nature)", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const bulbasaur = pokemon.find((p) => p.id === 1 && p.form_id === 0);
  assert.ok(bulbasaur);
  assert.equal(bulbasaur!.color, "green");
  // Raw base stats (PokéAPI): hp 45, atk 49, def 49, spa 65, spd 65, spe 45.
  // At level 100 with 31 IV / 0 EV / neutral nature: HP = 2*base+141, others = 2*base+36.
  assert.equal(bulbasaur!.stat_hp, 231);
  assert.equal(bulbasaur!.stat_attack, 134);
  assert.equal(bulbasaur!.stat_defense, 134);
  assert.equal(bulbasaur!.stat_special_attack, 166);
  assert.equal(bulbasaur!.stat_special_defense, 166);
  assert.equal(bulbasaur!.stat_speed, 126);
  assert.equal(bulbasaur!.stat_total, 957);
});

test("Pichu (#172, a baby Pokémon) is marked is_baby; Pikachu (its evolution) is not", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const pichu = pokemon.find((p) => p.id === 172 && p.form_id === 0);
  const pikachu = pokemon.find((p) => p.id === 25 && p.form_id === 0);
  assert.ok(pichu);
  assert.ok(pikachu);
  assert.equal(pichu!.is_baby, true);
  assert.equal(pikachu!.is_baby, false);
});

test("Pyroar (#668, a confirmed gender-difference species) has a non-null female sprite", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const pyroar = pokemon.find((p) => p.id === 668 && p.form_id === 0);
  assert.ok(pyroar);
  assert.ok(pyroar!.sprite_url_female, "expected Pyroar to have a female sprite URL");
  assert.ok(pyroar!.shiny_sprite_url_female, "expected Pyroar to have a shiny female sprite URL");
});

test("Bulbasaur (#1, no gender difference) has null female sprite fields", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const bulbasaur = pokemon.find((p) => p.id === 1 && p.form_id === 0);
  assert.ok(bulbasaur);
  assert.equal(bulbasaur!.sprite_url_female, null);
  assert.equal(bulbasaur!.shiny_sprite_url_female, null);
});

test("Charizard (#6, fully evolved) is marked is_final_evolution; Charmander (#4, first stage) is not", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const charizard = pokemon.find((p) => p.id === 6 && p.form_id === 0);
  const charmander = pokemon.find((p) => p.id === 4 && p.form_id === 0);
  assert.ok(charizard, "expected Charizard in pokemon.json");
  assert.ok(charmander, "expected Charmander in pokemon.json");
  assert.equal(charizard!.is_final_evolution, true);
  assert.equal(charmander!.is_final_evolution, false);
});

test("Tauros (#128, no evolution line at all) is marked is_final_evolution, including all 3 Paldean breed forms", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const tauros = pokemon.filter((p) => p.id === 128);
  assert.ok(tauros.length > 0, "expected Tauros in pokemon.json");
  for (const t of tauros) {
    assert.equal(t.is_final_evolution, true, `expected ${t.display_name} to be final-evolution (no evolution line)`);
  }
});

test("Espeon (#196), a non-Shadow gift, is Shiny-locked in Colosseum but huntable in XD at 1/8192 (Bulbapedia's own Shiny Pokémon article: Colosseum locks non-Shadow gifts like the starter Espeon/Umbreon; XD is the inverse and allows them)", async () => {
  const rows = await methodsFor(196);
  const colosseum = rows.find((r) => r.game === "colosseum" && r.method === "wild");
  const xd = rows.find((r) => r.game === "xd" && r.method === "wild");
  assert.equal(colosseum, undefined, "expected no colosseum row for Espeon (non-Shadow gift, locked there)");
  assert.ok(xd, "expected an xd/wild row for Espeon (non-Shadow evolution route, allowed there)");
  assert.equal(xd!.odds_base, 8192);
  assert.equal(xd!.odds_optimized, 8192);
});

test("Makuhita (#296), a genuine Shadow Pokémon in both games, is huntable in Colosseum at 1/8192 but Shiny-locked in XD (the games have opposite Shadow-Pokémon Shiny rules, confirmed via Bulbapedia's own Shiny Pokémon article)", async () => {
  const rows = await methodsFor(296);
  const colosseum = rows.find((r) => r.game === "colosseum" && r.method === "wild");
  const xd = rows.find((r) => r.game === "xd" && r.method === "wild");
  assert.ok(colosseum, "expected a colosseum/wild row for Makuhita (genuine Shadow Pokémon, allowed there)");
  assert.equal(colosseum!.odds_base, 8192);
  assert.equal(xd, undefined, "expected no xd row for Makuhita (Shadow Pokémon, locked there)");
});

test("Sableye (#302) has no Colosseum or XD shiny_methods rows (XD-exclusive Shadow Pokémon: not obtainable in Colosseum at all, and Shiny-locked in XD)", async () => {
  const rows = await methodsFor(302);
  assert.ok(rows.every((r) => r.game !== "colosseum" && r.game !== "xd"));
});

test("Furfrou (#676) is huntable in Legends: Z-A at 1/4096 (1/1024 with Charm — confirmed +3 rolls, same Legends-series exception as PLA)", async () => {
  const rows = await methodsFor(676);
  const za = rows.find((r) => r.game === "legends_za" && r.method === "wild");
  assert.ok(za, "expected a legends_za/wild row for Furfrou");
  assert.equal(za!.odds_base, 4096);
  assert.equal(za!.odds_optimized, 1024);
});

test("Manaphy (#490) is huntable via its egg in all 3 Ranger games at 1/8192 (Bulbapedia's shiny-lock page shows it obtainable, overturning the secondhand 'locked' assumption)", async () => {
  const rows = await methodsFor(490);
  for (const game of ["ranger", "ranger_soa", "ranger_gs"]) {
    const row = rows.find((r) => r.game === game && r.method === "wild");
    assert.ok(row, `expected a ${game}/wild row for Manaphy`);
    assert.equal(row!.odds_base, 8192);
  }
});

test("Dream Radar's roster grants Riolu (#447) a dream_radar row at 1/8192, no Charm", async () => {
  const rows = await methodsFor(447);
  const dreamRadar = rows.find((r) => r.game === "dream_radar" && r.method === "wild");
  assert.ok(dreamRadar, "expected a dream_radar/wild row for Riolu (confirmed on the Dream Radar roster page)");
  assert.equal(dreamRadar!.odds_base, 8192);
  assert.equal(dreamRadar!.odds_optimized, 8192);
});

test("Dream World contributes zero shiny_methods rows (confirmed fully shiny-locked, not a gap)", async () => {
  const all = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  assert.ok(all.every((r) => r.game !== "dream_world"));
});
