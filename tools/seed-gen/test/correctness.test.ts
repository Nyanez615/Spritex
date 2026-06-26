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
import type { CosmeticFormRow, EvolutionChainRow, PokemonRow, ShinyMethodRow } from "../src/deriveShinyMethods.js";

interface AbilityFact {
  name: string;
  isHidden: boolean;
}

async function methodsFor(
  pokemonId: number,
  formId = 0,
): Promise<ShinyMethodRow[]> {
  const all = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  return all.filter((m) => m.pokemon_id === pokemonId && m.form_id === formId);
}

/** The full resolved evolution chain (every member, any stage) that (pokemonId, formId) belongs to. */
async function chainFor(pokemonId: number, formId = 0): Promise<EvolutionChainRow[]> {
  const all = await readOutJson<EvolutionChainRow[]>("evolution-chains.json");
  const own = all.find((n) => n.pokemon_id === pokemonId && n.form_id === formId);
  if (!own) return [];
  return all.filter((n) => n.chain_id === own.chain_id);
}

test("Bulbasaur (#1) is SV-huntable at 1/512 via Mass Outbreak + Sparkling Power Lv.3 + Charm", async () => {
  const rows = await methodsFor(1);
  const sv = rows.find((r) => r.game === "sv" && r.method === "outbreak");
  assert.ok(sv, "expected a sv/outbreak row for Bulbasaur");
  assert.equal(sv!.odds_optimized, 512);
});

test("Starly (#396), a genuine BDSP wild Route encounter, has BDSP Pokéradar chain-40 as its best method, at 1/94 with Charm", async () => {
  // Was Gengar (#94) — but Gengar's BDSP entry is "Evolve Haunter" (a real
  // evolution-only path, not a wild encounter), so it correctly lost its
  // chain_radar row once wild-only-method gating shipped (see
  // deriveShinyMethods.ts's WILD_ONLY_METHODS) — the original assertion was
  // unknowingly validating that bug. Starly is a confirmed wild Route/Lake
  // Verity/Great Marsh encounter in BDSP, preserving this test's real intent
  // (the 1/94 Pokéradar-chain-40-with-Charm figure itself).
  const rows = await methodsFor(396);
  const best = rows.find((r) => r.is_best_method);
  assert.ok(best, "expected exactly one is_best_method row for Starly");
  assert.equal(best!.game, "bdsp");
  assert.equal(best!.method, "chain_radar");
  assert.equal(best!.odds_optimized, 94);
});

test("Gen6+ Masuda Method + Shiny Charm lands at 1/512", async () => {
  const rows = await methodsFor(1);
  const masuda = rows.find(
    (r) => r.game === "gen6_xy" && r.method === "masuda",
  );
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
  const da = rows.find(
    (r) => r.game === "swsh" && r.method === "dynamax_adventure",
  );
  assert.ok(
    da,
    "expected a swsh/dynamax_adventure row for Ivysaur (confirmed on the DA roster page)",
  );
  assert.equal(da!.odds_base, 300);
  assert.equal(da!.odds_optimized, 100);
});

test("DexNav (ORAS) is modeled at 1/62 (1/36 with Charm) for an ORAS-available species", async () => {
  const all = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const dexNav = all.find(
    (r) => r.game === "gen6_oras" && r.method === "dex_nav",
  );
  assert.ok(dexNav, "expected at least one gen6_oras/dex_nav row");
  assert.equal(dexNav!.odds_base, 62);
  assert.equal(dexNav!.odds_optimized, 36);
});

test("Friend Safari roster grants Ditto (#132) a gen6_xy row at 1/819 (1/585 with Charm)", async () => {
  const rows = await methodsFor(132);
  const fs = rows.find(
    (r) => r.game === "gen6_xy" && r.method === "friend_safari",
  );
  assert.ok(
    fs,
    "expected a gen6_xy/friend_safari row for Ditto (confirmed on the Friend Safari roster page)",
  );
  assert.equal(fs!.odds_base, 819);
  assert.equal(fs!.odds_optimized, 585);
});

test("Brilliant Pokémon (SwSh) is modeled generically for any wild-available species", async () => {
  // Was Bulbasaur (#1) — but Bulbasaur's only SwSh availability is the Isle
  // of Armor's Master Dojo ("(Only one)" static gift), not a wild
  // encounter, so it correctly lost this row once wild-only-method gating
  // shipped — the original assertion was unknowingly validating that bug.
  // Wooloo is a confirmed wild Route 1/4/Motostoke Riverbank encounter.
  const rows = await methodsFor(831); // Wooloo
  const brilliant = rows.find(
    (r) => r.game === "swsh" && r.method === "brilliant_pokemon",
  );
  assert.ok(brilliant, "expected a swsh/brilliant_pokemon row for Wooloo");
  assert.equal(brilliant!.odds_base, 586);
  assert.equal(brilliant!.odds_optimized, 456);
});

test("Paldean Tauros's 3 breed forms are tracked as distinct pokemon rows", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const breeds = pokemon.filter(
    (p) => p.id === 128 && p.form_name === "Paldean",
  );
  assert.equal(
    breeds.length,
    3,
    "expected Combat/Blaze/Aqua Breed as 3 separate form_ids",
  );
  assert.deepEqual(
    new Set(breeds.map((p) => p.display_name)),
    new Set([
      "Paldean Tauros (Combat Breed)",
      "Paldean Tauros (Blaze Breed)",
      "Paldean Tauros (Aqua Breed)",
    ]),
  );
});

test("Paldean Tauros's breed forms each get their own SV availability (not all dumped onto the base form)", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const breeds = pokemon.filter(
    (p) => p.id === 128 && p.form_name === "Paldean",
  );
  for (const breed of breeds) {
    const rows = await methodsFor(128, breed.form_id);
    assert.ok(
      rows.some((r) => r.game === "sv"),
      `expected ${breed.display_name} to have sv availability`,
    );
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
      `${r.game}/${r.method} for pokemon ${r.pokemon_id}: optimized (${r.odds_optimized}) should never be worse than base (${r.odds_base})`,
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

test("Venusaur (#3) has a Mega cosmetic form with a non-null mega_stone_item (\"venusaurite\") and a Gigantamax cosmetic form with a null one (derived from PokéAPI's item effect_entries text, not a hardcoded table)", async () => {
  const forms = await readOutJson<CosmeticFormRow[]>("cosmetic-forms.json");
  const venusaurForms = forms.filter((f) => f.pokemon_id === 3 && f.form_id === 0);
  const mega = venusaurForms.find((f) => f.kind === "mega");
  const gmax = venusaurForms.find((f) => f.kind === "gmax");
  assert.ok(mega, "expected a mega cosmetic form for Venusaur");
  assert.equal(mega!.mega_stone_item, "venusaurite");
  assert.ok(gmax, "expected a gmax cosmetic form for Venusaur");
  assert.equal(gmax!.mega_stone_item, null);
});

test("Charizard (#6) has separate Mega X and Mega Y cosmetic forms with their own distinct stones (charizardite-x / charizardite-y)", async () => {
  const forms = await readOutJson<CosmeticFormRow[]>("cosmetic-forms.json");
  const charizardForms = forms.filter((f) => f.pokemon_id === 6 && f.form_id === 0);
  const megaX = charizardForms.find((f) => f.kind === "mega_x");
  const megaY = charizardForms.find((f) => f.kind === "mega_y");
  assert.ok(megaX, "expected a mega_x cosmetic form for Charizard");
  assert.equal(megaX!.mega_stone_item, "charizardite-x");
  assert.ok(megaY, "expected a mega_y cosmetic form for Charizard");
  assert.equal(megaY!.mega_stone_item, "charizardite-y");
});

test("every cosmetic_forms row references a real pokemon row (referential integrity — no orphaned mega/gmax entries)", async () => {
  const forms = await readOutJson<CosmeticFormRow[]>("cosmetic-forms.json");
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  assert.ok(forms.length > 0, "expected at least one cosmetic form to exist");
  const pokemonKeys = new Set(pokemon.map((p) => `${p.id}:${p.form_id}`));
  for (const f of forms) {
    assert.ok(
      pokemonKeys.has(`${f.pokemon_id}:${f.form_id}`),
      `cosmetic form ${f.display_name} references pokemon_id=${f.pokemon_id}/form_id=${f.form_id}, which doesn't exist in pokemon.json`,
    );
  }
});

test("Bulbasaur (#1) has base_experience 64 and an EV yield of +1 Special Attack, all other stats 0 (confirmed against PokéAPI's own base_experience/stats[].effort fields, previously fetched but discarded)", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const bulbasaur = pokemon.find((p) => p.id === 1 && p.form_id === 0);
  assert.ok(bulbasaur);
  assert.equal(bulbasaur!.base_experience, 64);
  assert.equal(bulbasaur!.ev_yield_hp, 0);
  assert.equal(bulbasaur!.ev_yield_attack, 0);
  assert.equal(bulbasaur!.ev_yield_defense, 0);
  assert.equal(bulbasaur!.ev_yield_special_attack, 1);
  assert.equal(bulbasaur!.ev_yield_special_defense, 0);
  assert.equal(bulbasaur!.ev_yield_speed, 0);
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
  assert.ok(
    pyroar!.sprite_url_female,
    "expected Pyroar to have a female sprite URL",
  );
  assert.ok(
    pyroar!.shiny_sprite_url_female,
    "expected Pyroar to have a shiny female sprite URL",
  );
});

test("Bulbasaur (#1) has Overgrow as a normal ability and Chlorophyll flagged isHidden (confirmed against PokéAPI's own is_hidden field, previously discarded)", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const bulbasaur = pokemon.find((p) => p.id === 1 && p.form_id === 0);
  assert.ok(bulbasaur);
  const abilities: AbilityFact[] = JSON.parse(bulbasaur!.abilities);
  const overgrow = abilities.find((a) => a.name === "overgrow");
  const chlorophyll = abilities.find((a) => a.name === "chlorophyll");
  assert.ok(overgrow, "expected an overgrow ability entry");
  assert.ok(chlorophyll, "expected a chlorophyll ability entry");
  assert.equal(overgrow!.isHidden, false);
  assert.equal(chlorophyll!.isHidden, true);
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
    assert.equal(
      t.is_final_evolution,
      true,
      `expected ${t.display_name} to be final-evolution (no evolution line)`,
    );
  }
});

test("Espeon (#196), a non-Shadow gift, is Shiny-locked in Colosseum but huntable in XD at 1/8192 (Bulbapedia's own Shiny Pokémon article: Colosseum locks non-Shadow gifts like the starter Espeon/Umbreon; XD is the inverse and allows them)", async () => {
  const rows = await methodsFor(196);
  const colosseum = rows.find(
    (r) => r.game === "colosseum" && r.method === "wild",
  );
  const xd = rows.find((r) => r.game === "xd" && r.method === "wild");
  assert.equal(
    colosseum,
    undefined,
    "expected no colosseum row for Espeon (non-Shadow gift, locked there)",
  );
  assert.ok(
    xd,
    "expected an xd/wild row for Espeon (non-Shadow evolution route, allowed there)",
  );
  assert.equal(xd!.odds_base, 8192);
  assert.equal(xd!.odds_optimized, 8192);
});

test("Makuhita (#296), a genuine Shadow Pokémon in both games, is huntable in Colosseum at 1/8192 but Shiny-locked in XD (the games have opposite Shadow-Pokémon Shiny rules, confirmed via Bulbapedia's own Shiny Pokémon article)", async () => {
  const rows = await methodsFor(296);
  const colosseum = rows.find(
    (r) => r.game === "colosseum" && r.method === "wild",
  );
  const xd = rows.find((r) => r.game === "xd" && r.method === "wild");
  assert.ok(
    colosseum,
    "expected a colosseum/wild row for Makuhita (genuine Shadow Pokémon, allowed there)",
  );
  assert.equal(colosseum!.odds_base, 8192);
  assert.equal(
    xd,
    undefined,
    "expected no xd row for Makuhita (Shadow Pokémon, locked there)",
  );
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
  const dreamRadar = rows.find(
    (r) => r.game === "dream_radar" && r.method === "wild",
  );
  assert.ok(
    dreamRadar,
    "expected a dream_radar/wild row for Riolu (confirmed on the Dream Radar roster page)",
  );
  assert.equal(dreamRadar!.odds_base, 8192);
  assert.equal(dreamRadar!.odds_optimized, 8192);
});

test("Dream World contributes zero shiny_methods rows (confirmed fully shiny-locked, not a gap)", async () => {
  const all = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  assert.ok(all.every((r) => r.game !== "dream_world"));
});

test("Bulbasaur (#1) and Charmander (#4), one-time X/Y gifts from Professor Sycamore, have a wild row in gen6_xy but no Chain Fishing or Pokéradar row there (those require a repeatable wild encounter, which a one-time gift isn't); that wild row is also flagged is_wild_encounter=false so the frontend doesn't mislabel a gift as a Wild Encounter", async () => {
  for (const id of [1, 4]) {
    const rows = await methodsFor(id);
    const wild = rows.find((r) => r.game === "gen6_xy" && r.method === "wild");
    assert.ok(wild, `expected a gen6_xy/wild row for pokemon ${id}`);
    assert.equal(
      wild!.is_wild_encounter,
      false,
      `expected pokemon ${id}'s gen6_xy gift row to be flagged non-wild for labeling purposes`,
    );
    assert.ok(
      rows.every(
        (r) =>
          !(
            r.game === "gen6_xy" &&
            (r.method === "chain_fishing" || r.method === "chain_radar")
          ),
      ),
      `expected no gen6_xy chain_fishing/chain_radar row for pokemon ${id}`,
    );
  }
});

test('The Sinnoh lake trio (Uxie #480, Mesprit #481, Azelf #482), each an "(Only one)" static encounter, have a wild row in gen4_dp/gen4_pt but no Pokéradar row there (a fixed static encounter isn\'t a chainable wild grass patch)', async () => {
  for (const id of [480, 481, 482]) {
    const rows = await methodsFor(id);
    for (const game of ["gen4_dp", "gen4_pt"]) {
      const wild = rows.find((r) => r.game === game && r.method === "wild");
      assert.ok(wild, `expected a ${game}/wild row for pokemon ${id}`);
      assert.ok(
        rows.every((r) => !(r.game === game && r.method === "chain_radar")),
        `expected no ${game}/chain_radar row for pokemon ${id}`,
      );
    }
  }
});

test('Manaphy (#490) has no PLA outbreak row (its Legends: Arceus availability is an "(Only one)" static encounter, not a Mass-Outbreak-eligible wild one) — its Ranger-egg wild rows from the earlier test are unaffected', async () => {
  const rows = await methodsFor(490);
  assert.ok(rows.every((r) => !(r.game === "pla" && r.method === "outbreak")));
});

test('Turtwig (#387), a starter gift ("[[First partner Pokémon]] from Professor Rowan\'s briefcase"), has a wild row in gen4_dp/gen4_pt but no Pokéradar row there — regression test for a gap the wild-gating heuristic initially missed (starter gifts use a different non-wild marker than NPC-gift/static encounters)', async () => {
  for (const game of ["gen4_dp", "gen4_pt"]) {
    const rows = await methodsFor(387);
    const wild = rows.find((r) => r.game === game && r.method === "wild");
    assert.ok(wild, `expected a ${game}/wild row for Turtwig`);
    assert.ok(
      rows.every((r) => !(r.game === game && r.method === "chain_radar")),
      `expected no ${game}/chain_radar row for Turtwig`,
    );
  }
});

test('Chespin (#650), a starter gift in X/Y with a second <br>-separated "Traded from [[Shauna]]" segment (plain text, no [[Trade]] wikilink), has a wild row in gen6_xy but no Chain Fishing or Pokéradar row there', async () => {
  const rows = await methodsFor(650);
  const wild = rows.find((r) => r.game === "gen6_xy" && r.method === "wild");
  assert.ok(wild, "expected a gen6_xy/wild row for Chespin");
  assert.ok(
    rows.every(
      (r) =>
        !(
          r.game === "gen6_xy" &&
          (r.method === "chain_fishing" || r.method === "chain_radar")
        ),
    ),
    "expected no gen6_xy chain_fishing/chain_radar row for Chespin",
  );
});

test("Ivysaur (#2)'s only X/Y availability is text-mentioned Friend Safari (\"Friend Safari (Grass type Safari)\"), not a Route/fishing encounter — has a wild row in gen6_xy (still genuinely wild, just not chainable) but no Chain Fishing or Pokéradar row there. Regression test for a real reported bug: Friend-Safari-as-text was defaulting to chainable before NON_CHAINABLE_MARKERS existed", async () => {
  const rows = await methodsFor(2);
  const wild = rows.find((r) => r.game === "gen6_xy" && r.method === "wild");
  assert.ok(wild, "expected a gen6_xy/wild row for Ivysaur");
  assert.equal(
    wild!.is_wild_encounter,
    true,
    "Friend Safari is a genuine roaming wild encounter, just not chainable — should stay labeled Wild Encounter",
  );
  assert.ok(
    rows.every(
      (r) =>
        !(
          r.game === "gen6_xy" &&
          (r.method === "chain_fishing" || r.method === "chain_radar")
        ),
    ),
    "expected no gen6_xy chain_fishing/chain_radar row for Ivysaur",
  );
});

test("Turtwig (#387) in BDSP: a wild row exists (its Grand Underground Hideaway availability is genuinely repeatable wild, OR-merged with its starter-gift segment) but no Pokéradar row, since Pokéradar requires tall-grass encounters and the Grand Underground is a distinct \"symbol encounter\" mechanic per Bulbapedia. Regression test for a real reported bug: Grand-Underground-only availability was incorrectly granting Chain Radar before NON_CHAINABLE_MARKERS existed", async () => {
  const rows = await methodsFor(387);
  const wild = rows.find((r) => r.game === "bdsp" && r.method === "wild");
  assert.ok(wild, "expected a bdsp/wild row for Turtwig");
  assert.equal(
    wild!.is_wild_encounter,
    true,
    "the Grand Underground segment is genuinely wild, OR-merged with the gift segment",
  );
  assert.ok(
    rows.every((r) => !(r.game === "bdsp" && r.method === "chain_radar")),
    "expected no bdsp/chain_radar row for Turtwig (Pokéradar doesn't work in the Grand Underground)",
  );
});

test("Alolan Rattata (#19) has no Gen 4 (Diamond/Pearl/Platinum/HeartGold-SoulSilver) shiny_methods rows — Alolan forms didn't exist until Gen 7, so an unannotated pre-Gen-7 area cell must never resolve to a regional form. Regression test for a real reported bug: the resolveFormIdsAndWildness fallback used to apply every unannotated area cell to every variety of the species, including regional forms that postdate it by multiple generations", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const alolan = pokemon.find((p) => p.id === 19 && p.form_name === "Alolan");
  assert.ok(alolan, "expected an Alolan Rattata row in pokemon.json");
  const rows = await methodsFor(19, alolan!.form_id);
  for (const game of ["gen4_dp", "gen4_pt", "gen4_hgss"]) {
    assert.ok(
      rows.every((r) => r.game !== game),
      `expected no ${game} row for Alolan Rattata (didn't exist yet)`,
    );
  }
});

test("Alolan Rattata (#19) still has its real Gen 7 (Sun/Moon) availability — the regional-form fix must not strip genuine availability, only the impossible pre-Gen-7 rows", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const alolan = pokemon.find((p) => p.id === 19 && p.form_name === "Alolan");
  assert.ok(alolan, "expected an Alolan Rattata row in pokemon.json");
  const rows = await methodsFor(19, alolan!.form_id);
  assert.ok(
    rows.some((r) => r.game === "gen7_sm"),
    "expected a gen7_sm row for Alolan Rattata",
  );
});

test("Base (Kantonian) Rattata (#19, form_id 0) keeps its genuine Gen 4 availability — confirms the regional-form fix didn't over-correct and strip the base form's own real rows", async () => {
  const rows = await methodsFor(19, 0);
  assert.ok(
    rows.some((r) => r.game === "gen4_dp"),
    "expected a gen4_dp row for base Rattata",
  );
});

test("Galarian Meowth (#52)'s resolved evolution stage correctly points at Perrserker (#863), one stage past Galarian Meowth's own — Perrserker and Persian are flat, direct sibling children of Meowth in PokéAPI's raw chain tree (confirmed live: meowth.evolves_to has 2 entries, not 1), with the regional-form disambiguation carried entirely by each edge's base_form field, not by tree nesting depth; Kantonian Persian still appears in the same shared-chain_id family (by design — see the Yamask test below), just at its own correct stage, not Galarian Meowth's", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const galarianMeowth = pokemon.find((p) => p.id === 52 && p.form_name === "Galarian");
  assert.ok(galarianMeowth, "expected a Galarian Meowth row in pokemon.json");
  const chain = await chainFor(52, galarianMeowth!.form_id);
  const perrserker = chain.find((n) => n.pokemon_id === 863);
  const persian = chain.find((n) => n.pokemon_id === 53 && n.form_id === 0);
  assert.ok(perrserker, "expected Perrserker in Galarian Meowth's resolved chain");
  assert.ok(persian, "expected (Kantonian) Persian to still share the same chain_id");
  assert.equal(perrserker!.chain_id, persian!.chain_id);
  assert.equal(perrserker!.stage, chain.find((n) => n.pokemon_id === 52 && n.form_id === galarianMeowth!.form_id)!.stage + 1);
});

test("Kantonian and Alolan Meowth (#52) each resolve to their own respective Persian form (#53) at stage 1 — chainFor returns the whole shared-chain_id family regardless of query perspective (by design, so navigating from any one form surfaces every sibling form too), but each member's OWN stage must still reflect its real, form-specific evolution path", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const alolanMeowth = pokemon.find((p) => p.id === 52 && p.form_name === "Alolan");
  assert.ok(alolanMeowth, "expected an Alolan Meowth row in pokemon.json");

  const chain = await chainFor(52, 0);
  const kantonianPersian = chain.find((n) => n.pokemon_id === 53 && n.form_id === 0);
  const alolanPersian = chain.find((n) => n.pokemon_id === 53 && n.form_id !== 0);
  assert.ok(kantonianPersian, "expected Kantonian Persian in the chain");
  assert.ok(alolanPersian, "expected Alolan Persian (a non-base form_id) in the chain");
  assert.equal(kantonianPersian!.stage, 1);
  assert.equal(alolanPersian!.stage, 1);
});

test("Kantonian Persian (#53) and Perrserker (#863) have no further evolution — the walk correctly terminates leaves instead of over-extending", async () => {
  const persianChain = await chainFor(53, 0);
  const persianNode = persianChain.find((n) => n.pokemon_id === 53 && n.form_id === 0)!;
  assert.ok(!persianChain.some((n) => n.stage > persianNode.stage), "expected no chain member at a stage beyond Persian's own");

  const perrserkerChain = await chainFor(863, 0);
  const perrserkerNode = perrserkerChain.find((n) => n.pokemon_id === 863)!;
  assert.ok(!perrserkerChain.some((n) => n.stage > perrserkerNode.stage), "expected no chain member at a stage beyond Perrserker's own");
});

test("Galarian Yamask (#562)'s resolved evolution is Runerigus (#867) at stage 1, Kantonian Yamask's is Cofagrigus (#563) at stage 1 — both visible together under Yamask's one shared chain_id, each at its own correct form-specific stage", async () => {
  const chain = await chainFor(562, 0);
  const cofagrigus = chain.find((n) => n.pokemon_id === 563);
  const runerigus = chain.find((n) => n.pokemon_id === 867);
  assert.ok(cofagrigus, "expected Cofagrigus in the chain");
  assert.ok(runerigus, "expected Runerigus in the chain");
  assert.equal(cofagrigus!.stage, 1);
  assert.equal(runerigus!.stage, 1);
});

test("Tauros (#128), with no evolution at all, still gets an evolution_chains row for each of its 4 forms, all stage 0 under one shared chain_id — regression test for a real bug: the edge-driven walk alone never discovers a regional/breed form whose species has zero evolution edges at all", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const tauros = pokemon.filter((p) => p.id === 128);
  assert.equal(tauros.length, 4, "expected 4 tracked Tauros forms (base + 3 Paldean breeds)");
  for (const t of tauros) {
    const chain = await chainFor(128, t.form_id);
    assert.equal(chain.length, 4, `expected all 4 Tauros forms visible from ${t.display_name}'s own chain view`);
    assert.ok(chain.every((n) => n.stage === 0), `expected every Tauros form to be stage 0 from ${t.display_name}'s view`);
  }
});

test("Galarian Darmanitan (#555) is tracked as its own Ice-type regional form, with only its real SwSh-era availability — not Kantonian Darmanitan's pre-Gen-8 rows. Regression test for a real reported bug: its English form name is \"Standard Galarian Darmanitan\" (the regional adjective isn't the first word, because Darmanitan's own Standard/Zen battle-mode split is layered on top), which a strict English-name-prefix check missed entirely", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const galarianDarmanitan = pokemon.find((p) => p.id === 555 && p.form_name === "Galarian");
  assert.ok(galarianDarmanitan, "expected a Galarian Darmanitan row in pokemon.json");
  assert.deepEqual(JSON.parse(galarianDarmanitan!.types), ["ice"]);
  assert.equal(
    galarianDarmanitan!.display_name,
    "Galarian Darmanitan",
    "expected the redundant 'Standard ' qualifier stripped — there's nothing left to disambiguate against since Zen Mode is never tracked",
  );

  const rows = await methodsFor(555, galarianDarmanitan!.form_id);
  assert.ok(rows.length > 0, "expected at least one shiny_methods row for Galarian Darmanitan");
  assert.ok(rows.every((r) => r.game === "swsh"), "expected Galarian Darmanitan's availability to be SwSh-only");

  const baseRows = await methodsFor(555, 0);
  assert.ok(baseRows.some((r) => r.game === "gen5_bw"), "expected base Darmanitan to keep its own real pre-Gen-8 availability");
});

test('"Totem" PokéAPI varieties (Totem Alolan Marowak, Totem Alolan Raticate) stay excluded, not promoted into pokemon rows by the broadened regional-adjective match above — confirmed via Bulbapedia\'s "Totem Pokémon" article that the boosted Totem state can never be caught/owned ("due to the island challenge rules"), the practical equivalent of battle-only despite PokéAPI not flagging it that way', async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const marowak = pokemon.filter((p) => p.id === 105);
  const raticate = pokemon.filter((p) => p.id === 20);
  assert.equal(marowak.length, 2, "expected only base + Alolan Marowak, no Totem row");
  assert.equal(raticate.length, 2, "expected only base + Alolan Raticate, no Totem row");
});

// --- Group A/B form-tracking audit (zen mode and ~125 other unmodeled forms) ---
//
// User's decision rule: a variant gets its own `pokemon` row if it has any
// real mechanical difference from the base form, UNLESS it's a
// transformation of the same individual forced back to normal the instant
// you leave the triggering context (Mega/Gmax-shaped — those go in
// `cosmetic_forms` instead). Every species below was checked against
// Bulbapedia's own "List of Pokémon with form differences" page and/or its
// own species article, not inferred from PokéAPI's is_battle_only flag
// (verified unreliable — see fetchPokeapi.ts's GROUP_A_FORM_NAMES header).

test("Deoxys (#386) has all 4 formes (Normal/Attack/Defense/Speed) as distinct pokemon rows with genuinely different stat blocks (confirmed real, persistent forms — switched via meteorite, not battle-only)", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const deoxys = pokemon.filter((p) => p.id === 386).sort((a, b) => a.form_id - b.form_id);
  assert.equal(deoxys.length, 4, "expected Normal/Attack/Defense/Speed as 4 separate form_ids");
  const attackStats = new Set(deoxys.map((d) => d.stat_attack));
  assert.equal(attackStats.size, 4, "expected each Deoxys forme to have a distinct Attack stat");
});

test("Crowned Zacian (#888) is tracked as its own Fairy/Steel form with a higher Attack than base Zacian (Fairy-only) — confirmed it persists in storage (shown in the PC box while holding the Rusted Sword), unlike PokéAPI's misleading is_battle_only:true flag", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const base = pokemon.find((p) => p.id === 888 && p.form_id === 0);
  const crowned = pokemon.find((p) => p.id === 888 && p.form_name === "Crowned");
  assert.ok(base, "expected base Zacian");
  assert.ok(crowned, "expected a Crowned Zacian row");
  assert.deepEqual(JSON.parse(base!.types), ["fairy"]);
  assert.deepEqual(JSON.parse(crowned!.types), ["fairy", "steel"]);
  assert.ok(crowned!.stat_attack > base!.stat_attack, "expected Crowned Zacian's Attack to exceed base Zacian's");
});

test("Wormadam (#413) has all 3 cloaks (Plant/Sandy/Trash) as distinct pokemon rows with their own correct, distinct types — resolveAnnotation's qualifier-word generalization (\"Cloak\"/\"Cloaks\") correctly disambiguates Bulbapedia's '''Sandy Cloak'''/'''Trash Cloak''' bold annotations", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const wormadam = pokemon.filter((p) => p.id === 413).sort((a, b) => a.form_id - b.form_id);
  assert.equal(wormadam.length, 3, "expected Plant/Sandy/Trash Cloak as 3 separate form_ids");
  assert.deepEqual(
    wormadam.map((w) => JSON.stringify(JSON.parse(w.types).sort())),
    [JSON.stringify(["bug", "grass"]), JSON.stringify(["bug", "ground"]), JSON.stringify(["bug", "steel"])],
  );
});

test("Pumpkaboo (#710) has all 4 sizes (Average/Small/Large/Super) as distinct pokemon rows, each with real SV/SwSh availability — resolveAnnotation's ANNOTATION_NAME_SYNONYMS maps Bulbapedia's colloquial \"Medium\"/\"Jumbo\" wikitext synonyms to the canonical Average/Super form names", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const pumpkabooRows = rows.filter((r) => r.pokemon_id === 710);
  const formIds = new Set(pumpkabooRows.map((r) => r.form_id));
  assert.deepEqual(formIds, new Set([0, 1, 2, 3]), "expected all 4 Pumpkaboo sizes to have their own real availability, not just the default");
});

test("Lycanroc (#745): Midday and Midnight Formes are available in vanilla Sun/Moon, but Dusk Form is NOT (it's Ultra Sun/Ultra Moon-exclusive, via a special Own-Tempo Rockruff). Regression test for a real bug: Bulbapedia's area text reads \"Unobtainable ('''Dusk Form''')\" for the Sun/Moon entry — a per-segment marker the parser never checked, so Dusk Form was incorrectly inheriting Sun/Moon availability from the same multi-form cell", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const lycanroc = (formId: number) => rows.filter((r) => r.pokemon_id === 745 && r.form_id === formId);
  const dusk = lycanroc(2);
  assert.ok(dusk.length > 0, "expected Dusk Lycanroc to have some availability (USUM/SV/SwSh)");
  assert.ok(dusk.every((r) => r.game !== "gen7_sm"), "expected no gen7_sm (vanilla Sun/Moon) row for Dusk Lycanroc");
  assert.ok(dusk.some((r) => r.game === "gen7_usum"), "expected a gen7_usum row for Dusk Lycanroc");
  for (const formId of [0, 1]) {
    assert.ok(lycanroc(formId).some((r) => r.game === "gen7_sm"), `expected a gen7_sm row for Lycanroc form_id ${formId} (Midday/Midnight)`);
  }
});

test("Alolan Vulpix (#37) has no Brilliant Diamond/Shining Pearl availability — confirmed via Bulbapedia's own wikitext (\"Unobtainable ('''Alolan Form''')\" inline in the Shining Pearl cell, alongside Kantonian Vulpix's real Grand Underground availability in the same multi-form cell). Same root-cause regression as the Lycanroc test above, different species", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const alolan = pokemon.find((p) => p.id === 37 && p.form_name === "Alolan");
  assert.ok(alolan, "expected an Alolan Vulpix row in pokemon.json");
  const alolanRows = rows.filter((r) => r.pokemon_id === 37 && r.form_id === alolan!.form_id);
  assert.ok(alolanRows.every((r) => r.game !== "bdsp"), "expected no bdsp row for Alolan Vulpix");
  const baseRows = rows.filter((r) => r.pokemon_id === 37 && r.form_id === 0);
  assert.ok(baseRows.some((r) => r.game === "bdsp"), "expected Kantonian Vulpix to keep its own real BDSP availability");
});

test("Urshifu's Single Strike (form 0) and Rapid Strike (form 1) styles share IDENTICAL availability across every game — confirmed via direct wikitext fetch that Bulbapedia's Game-locations table never disambiguates between styles at all (one generic \"Evolve Kubfu\" entry covers both), so CONCURRENT_UNDISAMBIGUATED_SPECIES applies the same fact to every tracked variety rather than defaulting to the base form only (which would incorrectly drop Rapid Strike entirely)", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const single = rows.filter((r) => r.pokemon_id === 892 && r.form_id === 0).map((r) => `${r.game}:${r.method}`).sort();
  const rapid = rows.filter((r) => r.pokemon_id === 892 && r.form_id === 1).map((r) => `${r.game}:${r.method}`).sort();
  assert.deepEqual(single, rapid, "expected identical (game, method) availability for both Urshifu styles");
});

test("Urshifu is fully Shiny-locked in both SwSh and SV for BOTH styles, not just Single Strike — regression test for a real bug: Bulbapedia's own shiny-lock list also never disambiguates Urshifu's styles (formName: null), and resolveLockedGames originally defaulted an unannotated lock to formId 0 only, leaving Rapid Strike (form_id 1) incorrectly shiny-huntable while Single Strike was correctly locked", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const urshifuRows = rows.filter((r) => r.pokemon_id === 892);
  assert.equal(urshifuRows.length, 0, "expected zero shiny_methods rows for Urshifu in any form (fully locked in every game it's available in)");
});

test("Shellos/Gastrodon (#422/#423) stay deferred — only 1 tracked variety each, not split into West/East Sea forms — a deliberate, documented scope decision: PokéAPI models their forms as sprite-only pokemon-form resources (no separate stat block) attached to a single species variety, structurally incompatible with this pipeline's per-variety form-detection mechanism, unlike every other Group A species which has its own real stat-bearing PokéAPI variety", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const shellos = pokemon.filter((p) => p.id === 422);
  const gastrodon = pokemon.filter((p) => p.id === 423);
  assert.equal(shellos.length, 1, "expected Shellos to stay a single tracked variety (deferred, not silently dropped)");
  assert.equal(gastrodon.length, 1, "expected Gastrodon to stay a single tracked variety (deferred, not silently dropped)");
});

test("Primal Groudon and Primal Kyogre have their own real, boosted cosmetic_forms stat/type data (Groudon gains the Fire type, both get a large Attack boost) — confirmed via Bulbapedia's \"temporarily... in battle\" wording that Primal Reversion reverts outside battle, so it's modeled as cosmetic_forms, not a real pokemon row, unlike Crowned Zacian above", async () => {
  const forms = await readOutJson<CosmeticFormRow[]>("cosmetic-forms.json");
  const primalGroudon = forms.find((f) => f.pokemon_id === 383 && f.kind === "primal");
  const primalKyogre = forms.find((f) => f.pokemon_id === 382 && f.kind === "primal");
  assert.ok(primalGroudon, "expected a primal cosmetic form for Groudon");
  assert.ok(primalKyogre, "expected a primal cosmetic form for Kyogre");
  assert.deepEqual(JSON.parse(primalGroudon!.types).sort(), ["fire", "ground"]);
  assert.equal(primalGroudon!.stat_attack, 396);
  assert.equal(primalKyogre!.stat_attack, 336);
});

test("Eternamax Eternatus (#890) has zero cosmetic_forms rows at all, not even a battle-only one — confirmed via Bulbapedia's own description that it's explicitly \"unobtainable\" outside one fixed story battle, the one form this audit excludes entirely rather than modeling as cosmetic", async () => {
  const forms = await readOutJson<CosmeticFormRow[]>("cosmetic-forms.json");
  const eternatusForms = forms.filter((f) => f.pokemon_id === 890);
  assert.ok(eternatusForms.every((f) => f.kind !== "eternamax"), "expected no eternamax cosmetic form for Eternatus");
});

test("Busted Mimikyu (#778) and Noice Eiscue (#875) are tracked as cosmetic_forms — resolved open question from this audit's plan: both species' own \"Form data\" wikitext sections explicitly confirm they always revert to Disguised/Ice Face outside of battle, settling the ambiguity the general form-differences page left open", async () => {
  const forms = await readOutJson<CosmeticFormRow[]>("cosmetic-forms.json");
  const busted = forms.find((f) => f.pokemon_id === 778 && f.kind === "busted");
  const noice = forms.find((f) => f.pokemon_id === 875 && f.kind === "noice");
  assert.ok(busted, "expected a busted cosmetic form for Mimikyu");
  assert.ok(noice, "expected a noice cosmetic form for Eiscue");
});

test("Galarian Darmanitan's own Zen Mode cosmetic form (kind \"galar-zen\") attaches to form_id 1 (Galarian), not form_id 0 (Kantonian) — regression test for a real bug: cosmeticFormKind's broadened is_battle_only catch-all started producing this row for the first time this round, but baseFormId was unconditionally hardcoded to 0 (correct for Mega/Gmax, which never pair with a regional form, but wrong here), so Kantonian Darmanitan incorrectly showed Galarian's Zen Mode and Galarian Darmanitan showed none of its own", async () => {
  const forms = await readOutJson<CosmeticFormRow[]>("cosmetic-forms.json");
  const kantonianZen = forms.find((f) => f.pokemon_id === 555 && f.kind === "zen");
  const galarianZen = forms.find((f) => f.pokemon_id === 555 && f.kind === "galar-zen");
  assert.ok(kantonianZen, "expected a zen cosmetic form for Darmanitan");
  assert.ok(galarianZen, "expected a galar-zen cosmetic form for Darmanitan");
  assert.equal(kantonianZen!.form_id, 0, "expected base Zen Mode to attach to Kantonian (form_id 0)");
  assert.equal(galarianZen!.form_id, 1, "expected Galarian Zen Mode to attach to Galarian Darmanitan (form_id 1), not the base form");
});

test("Alolan Rattata (#19) is correctly tracked as Generation 7, NOT Generation 1 — regression test for a real bug: every pokemon row's generation column was sourced from the species-level species.generation.name, the SAME value for every variety, including non-default ones. Alolan Rattata was introduced in Sun/Moon (Gen 7), four generations after Kantonian Rattata (Gen 1) — confirmed via PokéAPI's pokemon-form version_group field, resolved to a generation via the version-group resource's own generation field", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const alolan = pokemon.find((p) => p.id === 19 && p.form_name === "Alolan");
  const base = pokemon.find((p) => p.id === 19 && p.form_id === 0);
  assert.ok(alolan, "expected an Alolan Rattata row in pokemon.json");
  assert.ok(base, "expected a base Rattata row in pokemon.json");
  assert.equal(alolan!.generation, 7, "expected Alolan Rattata's generation to be 7 (Sun/Moon), not inherited from Kantonian Rattata");
  assert.equal(base!.generation, 1, "expected base Rattata's generation to stay 1");
});

test("Galarian Darmanitan (#555) is correctly tracked as Generation 8, NOT Generation 5 — same regression class as Alolan Rattata above, different species (introduced in Sword/Shield, four generations after Kantonian Darmanitan's Black/White debut)", async () => {
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const galarian = pokemon.find((p) => p.id === 555 && p.form_name === "Galarian");
  const base = pokemon.find((p) => p.id === 555 && p.form_id === 0);
  assert.ok(galarian, "expected a Galarian Darmanitan row in pokemon.json");
  assert.ok(base, "expected a base Darmanitan row in pokemon.json");
  assert.equal(galarian!.generation, 8, "expected Galarian Darmanitan's generation to be 8 (Sword/Shield), not inherited from Kantonian Darmanitan");
  assert.equal(base!.generation, 5, "expected base Darmanitan's generation to stay 5");
});

// --- Granular acquisition_method classification (the "Venusaur shouldn't say Gift / Static Encounter" fix) ---

test("Bulbasaur (#1)'s gen6_xy wild row is acquisition_method \"gift\" (a real Professor Sycamore gift) — Venusaur's (#3) own gen6_xy wild row is \"evolution\" (only reachable by evolving Ivysaur, never directly gifted), regression test for the bug that triggered this audit: both used to render the identical, misleading \"Gift / Static Encounter\" label", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const bulbasaur = rows.find((r) => r.pokemon_id === 1 && r.form_id === 0 && r.game === "gen6_xy" && r.method === "wild");
  const venusaur = rows.find((r) => r.pokemon_id === 3 && r.form_id === 0 && r.game === "gen6_xy" && r.method === "wild");
  assert.ok(bulbasaur, "expected a gen6_xy/wild row for Bulbasaur");
  assert.ok(venusaur, "expected a gen6_xy/wild row for Venusaur");
  assert.equal(bulbasaur!.acquisition_method, "gift");
  assert.equal(venusaur!.acquisition_method, "evolution");
});

test('The Sinnoh lake trio (Uxie #480, Mesprit #481, Azelf #482), genuine "(Only one)" static encounters, also classify as acquisition_method "gift" — confirmed empirically (not assumed) that Bulbapedia\'s wikitext has no textual signal distinguishing an NPC gift from a fixed "(Only one)" static encounter: both route through the identical [[List of in-game event Pokémon...|Only one]] catalog-link template (verified directly against Bulbasaur\'s Sycamore-lab gift vs. the lake trio\'s lake encounters)', async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  for (const id of [480, 481, 482]) {
    const row = rows.find((r) => r.pokemon_id === id && r.game === "gen4_dp" && r.method === "wild");
    assert.ok(row, `expected a gen4_dp/wild row for pokemon ${id}`);
    assert.equal(row!.acquisition_method, "gift");
  }
});

test("Alolan Vulpix (#37) is acquisition_method \"trade\" in SwSh — confirmed via Bulbapedia's own wikitext, a clean explicit [[Trade]]-only path with no concurrent gift/static segment to tie-break against", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const pokemon = await readOutJson<PokemonRow[]>("pokemon.json");
  const alolan = pokemon.find((p) => p.id === 37 && p.form_name === "Alolan");
  assert.ok(alolan, "expected an Alolan Vulpix row in pokemon.json");
  const row = rows.find((r) => r.pokemon_id === 37 && r.form_id === alolan!.form_id && r.game === "swsh" && r.method === "wild");
  assert.ok(row, "expected a swsh/wild row for Alolan Vulpix");
  assert.equal(row!.acquisition_method, "trade");
});

test('Chespin (#650)\'s X/Y wild row is acquisition_method "gift", not "trade" — its area= cell has TWO <br>-separated segments, a starter gift ("[[First partner Pokémon]] from Tierno") AND a later \'Traded from Shauna\' alternate path; "gift" is correct here since the starter gift is genuinely the primary, document-order-first acquisition path, not a misclassification', async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const row = rows.find((r) => r.pokemon_id === 650 && r.form_id === 0 && r.game === "gen6_xy" && r.method === "wild");
  assert.ok(row, "expected a gen6_xy/wild row for Chespin");
  assert.equal(row!.acquisition_method, "gift");
});

test("acquisition_method is always null for the masuda/dynamax_adventure/friend_safari method rows, even when the species' baseline wild row is non-wild — it's scoped to the baseline \"wild\" method row only, the same scoping is_wild_encounter already has", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const nonWildMethodRows = rows.filter((r) => r.method !== "wild");
  assert.ok(nonWildMethodRows.length > 0, "expected at least one non-wild-method row in the dataset");
  assert.ok(nonWildMethodRows.every((r) => r.acquisition_method === null), "expected acquisition_method to be null on every non-wild-method row");
});

// --- First-50-species audit (#1-50): 6 real bugs found via 3 parallel live-Bulbapedia audits ---

test('Caterpie (#10) in Black/White is acquisition_method "hatch", not wild, with no chain_radar/chain_fishing — regression test for a real bug found auditing #1-17: NON_WILD_MARKERS only recognized the generic "Hatch {{pkmn|Egg}}" phrasing, missing the much more common "Breed {{p|EvolvedSpecies}}" template/wikilink Bulbapedia uses when a pre-evolution\'s only source in a game is breeding its OWN evolved form (confirmed: White\'s entry reads "{{pkmn|breeding|Breed}} {{p|Metapod}} or {{p|Butterfree}}") — found on ~295 cached pages, not a one-off', async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const wild = rows.find((r) => r.pokemon_id === 10 && r.form_id === 0 && r.game === "gen5_bw" && r.method === "wild");
  assert.ok(wild, "expected a gen5_bw/wild row for Caterpie");
  assert.equal(wild!.is_wild_encounter, false);
  assert.equal(wild!.acquisition_method, "hatch");
  assert.ok(
    rows.every((r) => !(r.pokemon_id === 10 && r.game === "gen5_bw" && (r.method === "chain_radar" || r.method === "chain_fishing"))),
    "expected no gen5_bw chain_radar/chain_fishing row for Caterpie (breed-only, not a real wild encounter to chain against)",
  );
});

test('Weedle (#13) in Omega Ruby/Alpha Sapphire is acquisition_method "hatch" via the same "Breed {{p|X}}" phrasing, with no chain_fishing/dex_nav row — confirmed via the wikilink variant "[[Pokémon breeding|Breed]] {{p|X}}" too (Diglett #50 in X/Y), not just the template variant', async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const wild = rows.find((r) => r.pokemon_id === 13 && r.form_id === 0 && r.game === "gen6_oras" && r.method === "wild");
  assert.ok(wild, "expected a gen6_oras/wild row for Weedle");
  assert.equal(wild!.acquisition_method, "hatch");
  assert.ok(rows.every((r) => !(r.pokemon_id === 13 && r.game === "gen6_oras" && (r.method === "chain_fishing" || r.method === "dex_nav"))));

  const digletWild = rows.find((r) => r.pokemon_id === 50 && r.form_id === 0 && r.game === "gen6_xy" && r.method === "wild");
  assert.ok(digletWild, "expected a gen6_xy/wild row for Diglett");
  assert.equal(digletWild!.acquisition_method, "hatch", "expected the [[Pokémon breeding|Breed]] wikilink variant to be recognized too");
});

test("Alolan Raticate (#20) has real Sun AND Moon (gen7_sm) availability — regression test for a real bug found auditing #18-34: the bold form annotation in Raticate's own wikitext is \"'''{{rf|Alolan}} Form'''\" / \"'''[[Kanto]]nian Form'''\" (embedded wikitext markup, not the plain \"Alolan Form\"/\"Kantonian Form\" a reader sees rendered) — resolveAnnotation never rendered this to plain text before matching against tracked variety form names, so NEITHER bold annotation ever matched, and the entire entry's availability silently collapsed onto formId 0, leaving Alolan Raticate with zero gen7_sm rows", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const alolanWild = rows.find((r) => r.pokemon_id === 20 && r.form_id === 1 && r.game === "gen7_sm" && r.method === "wild");
  assert.ok(alolanWild, "expected a gen7_sm/wild row for Alolan Raticate");
  assert.equal(alolanWild!.is_wild_encounter, true);
});

test("Raichu's (#26) Alolan form (form_id 1) has zero Scarlet/Violet rows — its only SV source is \"{{g|HOME}}, [[Poké Portal News]]\" (a one-way transfer plus a one-time event-distribution feature, neither a native shiny-roll-bearing source), and zero rows in Legends: Z-A's wild method despite a real availability fact existing there — its only Z-A source is \"[[In-game trade|Trade]] Kantonian Raichu\" (a wikilink to the differently-titled \"In-game trade\" page, not literally \"[[Trade...\"), which the pre-existing trade regex never matched. Both are real bugs found auditing #18-34", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  assert.ok(rows.every((r) => !(r.pokemon_id === 26 && r.form_id === 1 && r.game === "sv")), "expected zero sv rows for Alolan Raichu (HOME/Poké-Portal-News-only)");

  const zaRow = rows.find((r) => r.pokemon_id === 26 && r.form_id === 1 && r.game === "legends_za" && r.method === "wild");
  assert.ok(zaRow, "expected a legends_za/wild row for Alolan Raichu");
  assert.equal(zaRow!.is_wild_encounter, false);
  assert.equal(zaRow!.acquisition_method, "trade");
});

test("Sandslash's (#28) Alolan form (form_id 1) gets no Brilliant Pokémon row in SwSh — its only base-game source is Trade and its only Expansion-Pass source is the Max Lair Dynamax Adventure den, neither a tall-grass encounter Brilliant Pokémon can spawn in. Regression test for a real bug found auditing #18-34: \"[[Max Lair]] ([[Dynamax Adventure]])\" mentioned inline in area= text (independent of the separate scrapeDynamaxAdventure.ts roster file, which already derives its own correct dynamax_adventure row) wasn't recognized as non-chainable, the same shape of gap Friend Safari/Grand Underground needed fixing for in an earlier round", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  assert.ok(
    rows.every((r) => !(r.pokemon_id === 28 && r.form_id === 1 && r.game === "swsh" && r.method === "brilliant_pokemon")),
    "expected no swsh/brilliant_pokemon row for Alolan Sandslash",
  );
  assert.ok(
    rows.some((r) => r.pokemon_id === 28 && r.form_id === 1 && r.game === "swsh" && r.method === "dynamax_adventure"),
    "expected the real swsh/dynamax_adventure row to still exist",
  );
});

test('Kantonian Sandshrew/Sandslash (#27/#28, form_id 0) and Kantonian Vulpix/Ninetales (#37/#38, form_id 0) have zero Sun/Moon and Ultra Sun/Ultra Moon rows — their only listed Gen 7 mainline source is "[[Pokémon Bank]]", a one-way cloud transfer with no new shiny roll (the same "no new roll happens there" principle already applied to Pal Park, just for when the equivalent fact shows up inline in an otherwise-real entry rather than as its own dedicated pseudo-version). Regression test for a real bug found auditing #18-50 across 4 species', async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  for (const id of [27, 28, 37, 38]) {
    assert.ok(
      rows.every((r) => !(r.pokemon_id === id && r.form_id === 0 && (r.game === "gen7_sm" || r.game === "gen7_usum"))),
      `expected zero gen7_sm/gen7_usum rows for pokemon ${id}'s base form (Pokémon-Bank-only, no native source)`,
    );
  }
});

test("Vulpix (#37) and Ninetales (#38) have real Scarlet/Violet availability for both forms — regression test for a real bug found auditing #35-50: Bulbapedia splits a species' DLC encounter locations into version-specific labels (\"The Hidden Treasure of Area Zero (Scarlet)\"/\"(Violet)\") when they genuinely differ by version, instead of the one shared label BULBAPEDIA_LABEL_TO_GAMES already had — the suffixed labels matched nothing, so parseAvailability's `if (!games) continue;` silently dropped the whole entry, found on 19 cached pages", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  for (const id of [37, 38]) {
    assert.ok(rows.some((r) => r.pokemon_id === id && r.game === "sv"), `expected at least one sv row for pokemon ${id}`);
  }
});

test("Nidoran♀ (#29) and Nidoran♂ (#32) are derived from genuinely distinct Bulbapedia pages — regression test for a real pipeline bug found auditing #18-34: httpCache.ts's sanitizeKey() collapsed both ♀ (U+2640) and ♂ (U+2642) to the same \"_\" character, so the two species' cache filenames collided and Nidoran♂'s shiny_methods rows were silently a byte-for-byte copy of Nidoran♀'s (its own page was never fetched at all) — verified via each row's own citation_url, which must point at the correct gender-specific Bulbapedia URL", async () => {
  const rows = await readOutJson<ShinyMethodRow[]>("shiny-methods.json");
  const femaleCitation = rows.find((r) => r.pokemon_id === 29)?.citation_url;
  const maleCitation = rows.find((r) => r.pokemon_id === 32)?.citation_url;
  assert.ok(femaleCitation, "expected at least one shiny_methods row for Nidoran♀");
  assert.ok(maleCitation, "expected at least one shiny_methods row for Nidoran♂");
  assert.notEqual(femaleCitation, maleCitation, "expected distinct citation URLs — same URL would mean the cache collision regressed");
  assert.match(femaleCitation!, /Nidoran%E2%99%80/, "expected Nidoran♀'s citation to point at its own (♀) Bulbapedia URL");
  assert.match(maleCitation!, /Nidoran%E2%99%82/, "expected Nidoran♂'s citation to point at its own (♂) Bulbapedia URL");
});
