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
