/**
 * Pulls per-species metadata + regional-form varieties + sprite URLs from
 * the live PokéAPI REST API (cached to disk — see httpCache.ts). PokéAPI's
 * own fair-use guidance prefers the bulk `api-data` dump for crawlers, but
 * that repo is multi-gigabyte (it includes every sprite binary); since this
 * pipeline only needs ~3 lightweight JSON endpoints per species (~3000
 * requests total) and caches them, a polite rate-limited REST crawl is the
 * more practical choice here without meaningfully departing from that
 * guidance's intent (don't hammer the live API with naive, uncached,
 * unbounded-concurrency requests).
 *
 * Wild/static/gift availability per game is NOT fetched here — see
 * scrapeBulbapedia.ts's header for why Bulbapedia's Game-locations table
 * ended up being the better single source for that, including for the
 * newest games where PokéAPI's own encounter data is known-incomplete.
 */
import { cachedJson, ConcurrencyLimiter, writeOutJson } from "./httpCache.js";
import { fetchMegaStoneMap } from "./megaStones.js";
import { cachedSpriteCrop, FULL_CANVAS_CROP } from "./spriteCrop.js";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

/**
 * Regional-form adjectives, matched as a standalone word anywhere in the
 * English name rather than matching PokéAPI's raw `form_name` slug. Most
 * real regional forms' English names start with "<Adjective> " — "Alolan
 * Raichu", "Galarian Meowth", "Paldean Tauros (Combat Breed)" — while
 * cosmetic forms that also reference a region never use the adjective form:
 * "Alola Cap Pikachu", "High Plains Vivillon". An exact `form_name` match
 * (an even earlier approach) misses Paldean Tauros's 3 breeds, whose
 * `form_name` is `"paldea-combat-breed"` etc., not exactly `"paldea"`.
 *
 * A strict-*prefix* check (an earlier version of this same check) in turn
 * misses Darmanitan: its Galarian Standard-mode variety's English name is
 * "Standard Galarian Darmanitan" — Galarian Darmanitan's own battle-mode
 * split (Standard/Zen, layered on top of the regional-form name) pushes the
 * adjective to the *second* word, not the first — confirmed missing from
 * `pokemon` entirely until exhaustively re-auditing every one of this
 * dataset's 325 non-default varieties (not just the originally-checked
 * regional-form species) turned up this and one other category, "Totem"
 * encounters (see the Totem check below), both missed by a strict prefix.
 */
/**
 * One entry per region: REGIONAL_ADJECTIVES' English display-name adjective
 * (matched against a variety's formDisplayName) alongside PokéAPI's own
 * short region-slug prefix (matched against a form_name slug — confirmed
 * live: Alolan Raichu's form_name is "alola", Galarian Darmanitan's is
 * "galar-standard"). Kept as one paired list, not two independently-
 * maintained ones, so a 5th region only needs updating in one place.
 */
const REGIONS = [
  { adjective: "Alolan", slug: "alola" },
  { adjective: "Galarian", slug: "galar" },
  { adjective: "Hisuian", slug: "hisui" },
  { adjective: "Paldean", slug: "paldea" },
];
const REGIONAL_ADJECTIVES = REGIONS.map((r) => r.adjective);

/**
 * Mega/Gmax forms confirmed, per-species via Bulbapedia (and in Floette's
 * case also via a stat-boost comparison: Mega Floette's HP/stats match a
 * boost over Eternal Floette's own base stats, not regular Floette's), to
 * attach to a SPECIFIC non-default tracked variety rather than the default
 * — found via an exhaustive re-check of every Mega/Gmax-bearing species
 * with more than one tracked variety, triggered by discovering Mega Floette
 * (a real, current Pokémon Legends: Z-A "Mega Dimension" DLC form,
 * confirmed live; PokéAPI's own `floette` species data was stale in this
 * pipeline's disk cache until refreshed) wrongly attached to regular
 * Floette ("Regular Floette cannot Mega Evolve" — Bulbapedia, explicit).
 * Most of this same Z-A wave's other new Mega forms (Raichu, Greninja) and
 * pre-existing Gmax forms (Toxtricity, Urshifu, Meowstic) self-disambiguate
 * via the generic name-substring match below (their own PokéAPI resource
 * name embeds the target variety's form name, e.g.
 * "toxtricity-low-key-gmax") — these two don't, since neither
 * "floette-mega" nor "zygarde-mega"/"zygarde-complete" embeds any hint of
 * which variety they attach to, so they need an explicit, cited override
 * the same way EVOLUTION_BASE_FORM_OVERRIDES/PARTNER_FORM_OVERRIDES already
 * do for other PokéAPI-structurally-inexpressible facts. Zygarde's Complete
 * Forme (itself only a cosmetic_forms entry, not a tracked variety — it has
 * no stat block of its own) is reachable only from 50% Forme while holding
 * Power Construct ("If its Ability is Power Construct and its HP drops
 * below half, then Zygarde [transforms into Complete Forme]" — Bulbapedia),
 * and Mega Zygarde requires Complete Forme specifically ("Zygarde,
 * exclusively in its Complete Forme, can Mega Evolve") — both correctly
 * attach to the one base variety (zygarde-50-power-construct) that can
 * actually reach them, not the default (Aura Break) 50% Forme. Two more
 * cases were caught only by re-checking every OTHER battle-only cosmetic
 * kind too, not just Mega/Gmax, once Greninja's own Mega attachment turned
 * out correct but its pre-existing "ash" (Ash-Greninja) cosmetic form did
 * not: "a Greninja with the Ability Battle Bond will transform into
 * Ash-Greninja" (Bulbapedia) — Battle Bond is itself a real, separately-
 * tracked variety (greninja-battle-bond), so Ash-Greninja attaches there,
 * not to the default Torrent/Protean Greninja. Likewise Terapagos: "it
 * changes from its Normal Form into its Terastal Form... and transforms
 * into its Stellar Form upon Terastallizing" (Bulbapedia) — by the time
 * Stellar Form is reachable, Terapagos has already automatically become
 * Terastal Form, so Stellar attaches there, not to the default Normal Form.
 */
const COSMETIC_BASE_FORM_OVERRIDES: Record<string, string> = {
  "floette-mega": "floette-eternal",
  "zygarde-complete": "zygarde-50-power-construct",
  "zygarde-mega": "zygarde-50-power-construct",
  "greninja-ash": "greninja-battle-bond",
  "terapagos-stellar": "terapagos-terastal",
};

/**
 * Resolves a battle-only cosmetic form's baseFormId — usually 0 (the
 * default variety), but not always. Three independent signals, checked in
 * order of specificity:
 * 1. The form's own `kind` embeds a regional adjective's slug (Galarian
 *    Darmanitan's own Zen Mode form_name is "galar-zen" — checked
 *    exhaustively against every cached is_battle_only form, the only such
 *    case in this dataset, but resolved generally rather than hardcoded).
 * 2. COSMETIC_BASE_FORM_OVERRIDES, for the confirmed cases with no
 *    derivable name hint at all (see its own comment above).
 * 3. A generic check: does the cosmetic form's own PokéAPI resource name
 *    embed a non-default tracked variety's form name (e.g.
 *    "toxtricity-low-key-gmax" embeds "low-key", "urshifu-rapid-strike-gmax"
 *    embeds "rapid-strike", "meowstic-female-mega" embeds "female")? Found
 *    by re-checking every Mega/Gmax-bearing species with more than one
 *    tracked variety against Bulbapedia directly — Toxtricity's Gigantamax
 *    Low Key and Urshifu's Gigantamax Rapid Strike were ALSO confirmed
 *    wrongly attached to their species' default variety (Amped/Single
 *    Strike) before this fix, not just the newly-discovered Floette case.
 */
function resolveCosmeticBaseFormId(apiPokemonName: string, kind: string, varieties: FetchedVariety[]): number {
  const region = REGIONS.find((r) => kind === r.slug || kind.startsWith(`${r.slug}-`));
  if (region) {
    return varieties.find((v) => v.formName === region.adjective)?.formId ?? 0;
  }
  const overrideTarget = COSMETIC_BASE_FORM_OVERRIDES[apiPokemonName];
  if (overrideTarget) {
    return varieties.find((v) => v.apiPokemonName === overrideTarget)?.formId ?? 0;
  }
  const nameMatch = varieties.find((v) => v.formName && apiPokemonName.includes(v.formName.toLowerCase().replace(/\s+/g, "-")));
  return nameMatch?.formId ?? 0;
}

/**
 * Non-regional alternate forms confirmed to deserve their own `pokemon` row
 * — matched against PokéAPI's raw `form_name` slug, not the English name
 * (these don't follow the "<Adjective> <Species>" pattern regional forms
 * do). A hand-maintained classification list, the same kind
 * `REGIONAL_ADJECTIVES` already is — not "data," a verified rule.
 *
 * The deciding test (confirmed per-species against Bulbapedia's own "List
 * of Pokémon with form differences" page and, where ambiguous, each
 * species' own article — NOT inferred from PokéAPI's `is_battle_only`
 * flag, which doesn't reliably track this; e.g. Crowned Zacian/Zamazenta is
 * flagged `is_battle_only` by PokéAPI despite persisting in storage as long
 * as it holds the Rusted Sword/Shield): does this form have a real stat/
 * type/Ability difference, AND can it persist as the saved state of a box
 * Pokémon (as opposed to a transformation of the same individual that's
 * forced back to normal the instant you leave the triggering context, like
 * Mega Evolution/Gigantamax)?
 *
 * Reversible field-state toggles confirmed to persist outside battle (no
 * "temporarily"/"in battle" qualifier in Bulbapedia's own description):
 * Deoxys, the Therian formes, Rotom, Origin Dialga/Palkia/Giratina, Shaymin
 * Sky, Kyurem's fusions, Necrozma's fusions (Ultra Necrozma itself stays
 * excluded — confirmed genuinely battle-only), Calyrex's Riders, Hoopa
 * Unbound, Ogerpon's masks, Crowned Zacian/Zamazenta, Zygarde's 10%/50%
 * Forme × {Aura Break, Power Construct} combinations (50%+Aura Break is
 * already the species' default variety; Complete/Mega Zygarde stay
 * excluded — confirmed battle-only/handled by the existing Mega path),
 * Oricorio's dance styles, Battle Bond Greninja (Ash-Greninja, the further
 * in-battle-only transformation of this same individual, stays excluded),
 * Partner Pikachu/Eevee, and Terapagos's Terastal Form (its real, permanent
 * evolution-like state — Stellar Form stays excluded, a pure in-battle
 * Terastallization layered on top).
 *
 * Evolution/encounter-locked, confirmed "cannot change forms": Lycanroc,
 * Toxtricity, Wormadam's cloaks, Urshifu's styles, Pumpkaboo/Gourgeist's
 * sizes, the 4 mechanical-gender-difference species (Basculegion/Indeedee/
 * Meowstic/Oinkologne), Ursaluna Bloodmoon, and Basculin's 3 stripe colors
 * (fixed for an individual's life, like Lycanroc's forme — initially missed
 * by this audit despite having its own distinct-ability real form split;
 * caught later via a live PokéAPI cross-check, not a code-review pass).
 *
 * Deliberately deferred, not silently dropped: Shellos/Gastrodon's East/
 * West Sea split and Arceus/Silvally's type-changing Plate/Memory formes
 * all share a genuinely different PokéAPI data shape than everything above
 * — confirmed live that these species have only ONE entry in
 * `species.varieties` (no separate stat-bearing variety per form at all),
 * with the alternates instead living as plain `pokemon-form` resources
 * (sprite data only, no stat override) attached to that one variety. This
 * pipeline's whole non-default-variety-based detection mechanism doesn't
 * apply to that shape; modeling it correctly needs separate, dedicated
 * pipeline work, not a forced fit here. Re-verified live a second time
 * (not just re-cited) when Basculin turned up as a real miss with this
 * exact write-up's shape of justification: confirmed Shellos/Gastrodon/
 * Arceus/Silvally genuinely still have only one PokéAPI variety each (a
 * second variety 404s), so the structural argument holds — but ALSO
 * confirmed two sharper, independent reasons even if that ever changed:
 * Shellos/Gastrodon's West/East Sea split has zero ability/stat/type
 * difference at all (Bulbapedia's own infobox — purely cosmetic, unlike
 * Basculin's distinct abilities), and Arceus/Silvally's Plate/Memory type
 * change is a real-time, held-item-driven recalculation with no discrete
 * trigger or persistent state at all (Bulbapedia's "Type change" article
 * groups Multitype/RKS System with Protean, which changes every turn) — not
 * even the same shape as Mega/Gmax's "in battle, reverts after," let alone
 * a real form `cosmetic_forms` could meaningfully snapshot.
 */
const GROUP_A_FORM_NAMES = new Set([
  "attack", "defense", "speed", // deoxys (normal is the default variety)
  "therian", // landorus / thundurus / tornadus / enamorus
  "heat", "wash", "frost", "fan", "mow", // rotom
  "origin", // dialga / palkia / giratina
  "sky", // shaymin
  "black", "white", // kyurem
  "dusk", "dawn", // necrozma (also lycanroc's Dusk forme — same slug, same group, no conflict) and necrozma
  "ice", "shadow", // calyrex
  "unbound", // hoopa
  "wellspring-mask", "hearthflame-mask", "cornerstone-mask", // ogerpon
  "crowned", // zacian / zamazenta
  "10", "10-power-construct", "50-power-construct", // zygarde
  "pom-pom", "pau", "sensu", // oricorio (baile is the default variety)
  "battle-bond", // greninja
  "starter", // pikachu / eevee (Partner forms)
  "terastal", // terapagos
  "midnight", // lycanroc
  "low-key", // toxtricity
  "sandy", "trash", // wormadam (plant is the default variety)
  "rapid-strike", // urshifu (single-strike is the default variety)
  "small", "large", "super", // pumpkaboo / gourgeist (average is the default variety)
  "female", // basculegion / indeedee / meowstic / oinkologne
  "bloodmoon", // ursaluna
  "white-striped", "blue-striped", // basculin (red-striped is the default variety) — a
  // real, Bulbapedia-documented 3-way form split (own infobox forme list, "Red-Striped
  // Form"/"Blue-Striped Form"/"White-Striped Form") initially missed by this audit:
  // identical stats/types across all 3, but each has its OWN distinct primary ability
  // (Reckless/Rock Head/Rattled, confirmed live via PokéAPI) and only White-Striped can
  // evolve into Basculegion (PokéAPI's evolution_details.base_form is explicitly
  // "basculin-white-striped") — a real mechanical difference even without a stat
  // difference, unlike Shellos/Gastrodon/Arceus/Silvally below, which really do have
  // only one PokéAPI variety each (re-verified live, not just re-cited).
  "own-tempo", // rockruff (the regular Keen Eye/Vital Spirit/Steadfast form is the
  // default variety) — confirmed via Bulbapedia's own infobox/evolution prose: only
  // Own Tempo Rockruff can evolve into Dusk Form Lycanroc; the other 3 abilities can
  // only reach Midday/Midnight. A real, distinct primary-ability difference (own vs.
  // the regular 1+2 ability layout). See EVOLUTION_BASE_FORM_OVERRIDES in
  // fetchEvolutionChains.ts — PokéAPI's evolution_details for this chain never sets
  // base_form at all (only evolved_form, keyed by time_of_day), so the generic
  // ambiguous-fan-out logic there can't disambiguate this on its own.
  "yellow-plumage", "white-plumage", // squawkabilly (green-plumage is the default
  // variety; blue-plumage stays excluded below — confirmed identical to green's
  // ability set, purely cosmetic) — confirmed via Bulbapedia's own infobox: Green/Blue
  // Plumage share Guts as their hidden ability, Yellow/White Plumage have Sheer Force
  // instead. A real hidden-ability difference, the same bar Basculin's stripes clear.
  // Squawkabilly itself never evolves, so no evolution-edge concern here.
  "eternal", // floette (any colored-flower variety is the default) — Eternal Flower
  // Floette is a real, Bulbapedia-confirmed individual obtainable since Legends: Z-A
  // ("Received from Taunie/Urbain upon completing Main Mission 39 (Only one)"), with
  // dramatically higher stats than a colored-flower Floette (roughly Florges-tier) —
  // every earlier game's wikitext already marks it "Unreleased"/"Unobtainable
  // ('''Eternal Flower''')", confirming this isn't a new ability for it, just newly
  // obtainable. It does not evolve from Flabébé or into Florges (see
  // EVOLUTION_EDGE_EXCLUDED_FORM_NAMES in fetchEvolutionChains.ts) — confirmed live
  // that PokéAPI's evolution_details for this chain never references it at all, so
  // without that exclusion the existing ambiguous-fan-out logic would wrongly wire it
  // into both edges once it's a tracked variety.
]);

/**
 * Minior's exposed-core forms ("Red Core Minior", etc.) — confirmed real and
 * battle-only/HP-reverting via Bulbapedia ("It is normally in its Meteor
 * Form, but when its HP is below half, its core becomes exposed... It will
 * revert back to its Meteor Form if its HP is restored above 50%"), the
 * same shape as Zen Mode/Castform/Cherrim already routed to cosmetic_forms.
 * But PokéAPI's own `is_battle_only` flag is confirmed BACKWARDS for this
 * species specifically: the persistent Meteor-shell forms ("red-meteor"
 * etc.) are flagged `is_battle_only: true`, while the actual battle-only
 * Core forms ("red" etc.) are flagged `false` — confirmed live via direct
 * fetch of both. Without this override, Core forms fall through the
 * regular acceptance gate (no regional adjective, not in
 * GROUP_A_FORM_NAMES) and get silently dropped — found via an exhaustive
 * scan of every currently-dropped non-default variety across the dataset,
 * the same audit that caught Basculin. Real stat redistribution confirmed
 * (e.g. Red Core: 100/60/100/60/120 vs. Red Meteor: 60/100/60/100/60 —
 * same total, Attack/Sp.Atk/Speed and Defense/Sp.Def swap), so these are
 * tracked via cosmetic_forms (battle-only, reverting) rather than as
 * GROUP_A_FORM_NAMES full `pokemon` rows.
 */
const FORCE_COSMETIC_FORM_NAMES = new Set(["red", "orange", "yellow", "green", "blue", "indigo", "violet"]);

/**
 * Per-variety overrides for the two species-level-only fields PokéAPI's
 * `pokemon-species` resource can't express per-variety at all (only one
 * gender_rate/growth_rate value exists per species, full stop). Confirmed
 * via Bulbapedia's "Partner Pokémon" article: Partner Pikachu/Eevee are
 * "in the Medium Slow Experience group ... rather than the Medium Fast
 * group like their regular counterparts," and have "an effective gender
 * ratio of one male to one female ... rather than seven males to one
 * female like regular Eevee" (Pikachu's own species-level gender_rate is
 * already 4 — i.e. already 1:1 — so this is a no-op correction for
 * Pikachu and the real fix only for Eevee, applied uniformly since both
 * are tagged "Starter" and there's no cleaner per-species signal to read
 * this from). Keyed by formName, not species id, since GROUP_A_FORM_NAMES'
 * "starter" entry is confirmed to apply only to these two species.
 */
const PARTNER_FORM_OVERRIDES: Record<string, { genderRate: number; growthRate: string }> = {
  Starter: { genderRate: 4, growthRate: "medium-slow" },
};

interface PokeApiNamedResource {
  name: string;
  url: string;
}

interface PokeApiSpeciesList {
  count: number;
  results: PokeApiNamedResource[];
}

interface PokeApiLocalizedName {
  name: string;
  language: PokeApiNamedResource;
}

interface PokeApiSpecies {
  id: number;
  name: string;
  gender_rate: number;
  has_gender_differences: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  is_baby: boolean;
  generation: PokeApiNamedResource;
  egg_groups: PokeApiNamedResource[];
  /** In cycles — 1 cycle = 255 steps (Bulbapedia convention). */
  hatch_counter: number;
  names: PokeApiLocalizedName[];
  varieties: Array<{ is_default: boolean; pokemon: PokeApiNamedResource }>;
  color: PokeApiNamedResource;
  shape: PokeApiNamedResource | null;
  growth_rate: PokeApiNamedResource;
  capture_rate: number;
  base_happiness: number;
  evolution_chain: { url: string };
  flavor_text_entries: Array<{ flavor_text: string; language: PokeApiNamedResource; version: PokeApiNamedResource }>;
}

interface PokeApiSprites {
  front_default: string | null;
  front_shiny: string | null;
  front_female: string | null;
  front_shiny_female: string | null;
  other?: {
    "official-artwork"?: { front_default: string | null; front_shiny: string | null };
    home?: { front_default: string | null; front_shiny: string | null };
  };
}

interface PokeApiPokemon {
  id: number;
  name: string;
  height: number;
  weight: number;
  base_experience: number | null;
  types: Array<{ slot: number; type: PokeApiNamedResource }>;
  sprites: PokeApiSprites;
  forms: PokeApiNamedResource[];
  stats: Array<{ base_stat: number; effort: number; stat: PokeApiNamedResource }>;
  abilities: Array<{ ability: PokeApiNamedResource; is_hidden: boolean }>;
}

interface PokeApiForm {
  is_battle_only: boolean;
  is_mega: boolean;
  is_default: boolean;
  form_name: string;
  names: PokeApiLocalizedName[];
  version_group: PokeApiNamedResource;
  sprites: PokeApiSprites;
  /** Real per-form type override (e.g. Arceus's "fire" form really is Fire-type) — empty for forms with no override, in which case the parent variety's own type applies. */
  types: Array<{ slot: number; type: PokeApiNamedResource }>;
}

interface PokeApiVersionGroup {
  generation: PokeApiNamedResource;
}

export interface FetchedVariety {
  formId: number;
  formName: string | null;
  displayName: string;
  /**
   * The generation THIS variety was introduced in — NOT always the species'
   * own generation. Regional/alternate forms can postdate their base species
   * by multiple generations (Alolan Rattata: Gen 7, despite Kantonian
   * Rattata being Gen 1) — confirmed live via PokéAPI's pokemon-form
   * `version_group` field, resolved to a generation via the version-group
   * resource's own `generation` field. Equal to the species' generation for
   * the default variety.
   */
  generationNumber: number;
  /**
   * Overrides the species-level gender_rate/growth_rate for this one
   * variety — undefined (the default for every variety except Partner
   * Pikachu/Eevee) means "use the species' own value," since PokéAPI's
   * `pokemon-species` resource only has room for one gender_rate/growth_rate
   * per species, no per-variety field at all. Partner Pikachu/Eevee
   * genuinely differ from their regular counterparts in the real games
   * (confirmed via Bulbapedia's "Partner Pokémon" article: "guaranteed...
   * Medium Slow Experience group... rather than Medium Fast," and an
   * effective 1:1 gender ratio rather than inherited from the species) —
   * see PARTNER_FORM_OVERRIDES below, the only two rows this is non-null for.
   */
  genderRate?: number;
  growthRate?: string;
  /** Raw PokéAPI pokemon-resource name this variety was fetched from (e.g. "meowth-alola") — lets fetchEvolutionChains.ts resolve evolution_details' base_form/evolved_form references back to a (pokemonId, formId) pair. */
  apiPokemonName: string;
  types: string[];
  spriteUrl: string;
  shinySpriteUrl: string;
  /** Gender-difference sprites — null for the ~90% of species with no visual gender difference. */
  spriteUrlFemale: string | null;
  shinySpriteUrlFemale: string | null;
  /**
   * spriteUrl's own non-transparent content region, as fractions (0..1) of
   * its canvas — see spriteCrop.ts's header for why this exists. bestSprite()
   * usually resolves to tightly-cropped official artwork for real pokemon
   * rows (this comes out near-full-canvas, a safe no-op), but nothing
   * guarantees that forever — computed unconditionally so any future
   * species/variety that ever falls through to the small basic sprite gets
   * the same fix automatically, not just decorative cosmetic_forms sprites.
   */
  spriteCropX: number;
  spriteCropY: number;
  spriteCropWidth: number;
  spriteCropHeight: number;
  /** Same idea as spriteCropX/Y/Width/Height, computed separately from spriteUrlFemale when it exists (a genuinely different sprite, not just a recolor) — FULL_CANVAS_CROP when there's no gender-difference sprite to crop. */
  spriteCropXFemale: number;
  spriteCropYFemale: number;
  spriteCropWidthFemale: number;
  spriteCropHeightFemale: number;
  /**
   * Same idea, computed separately from shinySpriteUrl — NOT reused from
   * spriteCropX/Y/Width/Height. An earlier version of this pipeline assumed
   * "confirmed live (Unown B) that a shiny sprite is a pure palette recolor
   * sharing the exact same alpha channel as its non-shiny counterpart" and
   * reused the standard crop for shiny too; confirmed false for Hisuian
   * Lilligant (a real user-reported bug, traced to here) — its shiny
   * recolor's flower/sparkle highlight genuinely extends further (real
   * measured height fraction 1.0, touching the canvas edge, vs. the
   * standard sprite's 0.848), so reusing the standard crop clipped real
   * shiny-only content. Unown B's claim still holds for Unown specifically;
   * it just isn't universal, so each sprite now gets its own measurement,
   * the same precedent spriteCropXFemale already set for gender differences.
   */
  spriteCropXShiny: number;
  spriteCropYShiny: number;
  spriteCropWidthShiny: number;
  spriteCropHeightShiny: number;
  /** Same idea, computed separately from shinySpriteUrlFemale — FULL_CANVAS_CROP when there's no gender-difference sprite at all. */
  spriteCropXShinyFemale: number;
  spriteCropYShinyFemale: number;
  spriteCropWidthShinyFemale: number;
  spriteCropHeightShinyFemale: number;
  height: number;
  weight: number;
  abilities: Array<{ name: string; isHidden: boolean }>;
  /**
   * Base stats computed at level 100 with max neutral IVs (31), 0 EVs, neutral
   * nature — Bulbapedia's standard Gen 3+ stat formula collapses to
   * `2*base+141` for HP and `2*base+36` for every other stat at those inputs.
   * Confirmed convention with the user; not raw PokéAPI base_stat values.
   */
  statHp: number;
  statAttack: number;
  statDefense: number;
  statSpecialAttack: number;
  statSpecialDefense: number;
  statSpeed: number;
  statTotal: number;
  /** PokéAPI's `base_experience` — null for a handful of entries with no battle data. */
  baseExperience: number;
  /** EV yield per stat — PokéAPI's `stats[].effort`, raw (not the level-100 statAt100 transform above). */
  evYieldHp: number;
  evYieldAttack: number;
  evYieldDefense: number;
  evYieldSpecialAttack: number;
  evYieldSpecialDefense: number;
  evYieldSpeed: number;
}

export type CosmeticFormKind = string;

/**
 * Mega Evolution / Gigantamax — cosmetic battle forms, not distinct dex
 * entries (same reasoning that already excludes them from `varieties`):
 * Mega reverts after battle and Gigantamax doesn't change a species'
 * shininess, so neither needs its own shiny-method rows. Captured purely
 * for sprite display + (mega only) the required held item.
 */
export interface FetchedCosmeticForm {
  pokemonId: number;
  /**
   * Which varieties[].formId this attaches to — usually 0 (the default
   * variety), but genuinely NOT always: e.g. Galarian Darmanitan's own Zen
   * Mode ("galar-zen") attaches to formId 1 (Galarian), not formId 0
   * (Kantonian); Mega Floette attaches to Eternal Floette (confirmed:
   * "Regular Floette cannot Mega Evolve" — Bulbapedia), not regular Floette;
   * Gigantamax Low Key Toxtricity attaches to Low Key Toxtricity, not Amped.
   * Resolved by resolveCosmeticBaseFormId, not hardcoded — see its own doc
   * comment for the full reasoning (a real, repeatedly-confirmed bug class,
   * not a one-off: exhaustively re-checked every Mega/Gmax-bearing species
   * with more than one tracked variety against Bulbapedia directly).
   */
  baseFormId: number;
  /** Raw PokéAPI pokemon-resource name this cosmetic form was fetched from (e.g. "toxtricity-low-key-gmax") — lets resolveCosmeticBaseFormId disambiguate which tracked variety it attaches to. */
  apiPokemonName: string;
  kind: CosmeticFormKind;
  displayName: string;
  spriteUrl: string;
  shinySpriteUrl: string;
  /**
   * spriteUrl's own non-transparent content region, as fractions (0..1) of
   * its canvas — see spriteCrop.ts's header for why this exists.
   */
  spriteCropX: number;
  spriteCropY: number;
  spriteCropWidth: number;
  spriteCropHeight: number;
  /**
   * Same idea, computed separately from shinySpriteUrl — NOT reused from
   * spriteCropX/Y/Width/Height. See FetchedVariety.spriteCropXShiny's own
   * doc comment for the real, confirmed bug (Hisuian Lilligant) that proved
   * shiny sprites can't be assumed to share their non-shiny counterpart's
   * alpha shape.
   */
  spriteCropXShiny: number;
  spriteCropYShiny: number;
  spriteCropWidthShiny: number;
  spriteCropHeightShiny: number;
  /** PokéAPI item slug, e.g. "venusaurite" — null for Gigantamax (no held item). */
  megaStoneItem: string | null;
  /**
   * Mega/Gmax forms can have genuinely different types/stats/abilities than
   * the base form (e.g. Mega Charizard X is Fire/Dragon, not Fire/Flying;
   * Mega Venusaur has a single fixed ability, Thick Fat) — these were
   * already being fetched into fetchVarietyDetail's `shared` object but
   * discarded before this field set existed.
   */
  types: string[];
  height: number;
  weight: number;
  abilities: Array<{ name: string; isHidden: boolean }>;
  statHp: number;
  statAttack: number;
  statDefense: number;
  statSpecialAttack: number;
  statSpecialDefense: number;
  statSpeed: number;
  statTotal: number;
  baseExperience: number;
  evYieldHp: number;
  evYieldAttack: number;
  evYieldDefense: number;
  evYieldSpecialAttack: number;
  evYieldSpecialDefense: number;
  evYieldSpeed: number;
}

export interface FetchedSpecies {
  pokemonId: number;
  name: string;
  displayName: string;
  generationNumber: number;
  genderRate: number;
  hasGenderDifferences: boolean;
  isLegendary: boolean;
  isMythical: boolean;
  isBaby: boolean;
  isBreedable: boolean;
  /** Steps to hatch from an egg — PokéAPI's raw hatch_counter (cycles) * 255. */
  hatchSteps: number;
  color: string;
  /**
   * Null for a handful of legacy species PokéAPI never assigned a shape to.
   * Text only, deliberately not an icon — verified during implementation
   * that neither PokéAPI nor a CC0 source has shape-silhouette icon sprites
   * (the `/pokemon-shape/{id}` endpoint exposes only names, no sprite field;
   * checked live). Real footprint/shape icons exist on Bulbagarden Archives
   * (e.g. "F0252gen2.png"), but those are extracted in-game UI assets with
   * no confirmed open license — same "fair use" risk class already
   * confirmed for game box art/logos (see the Game-badge IP discussion),
   * not PokéAPI's CC0 sprite repo. Don't add icon sprites for shape or
   * footprint without first finding (and citing) an actually CC0/openly-
   * licensed source — none is known to exist as of this writing.
   */
  shape: string | null;
  growthRate: string;
  eggGroups: string[];
  captureRate: number;
  baseHappiness: number;
  evolutionChainUrl: string;
  /** Latest English Pokédex description across every game PokéAPI has indexed — null only if no English entry exists at all. */
  flavorText: string | null;
  varieties: FetchedVariety[];
}

/**
 * PokéAPI's flavor_text_entries spans every game version PokéAPI has indexed,
 * confirmed live to be in chronological array order — so the last English
 * entry is always the most recently released game's text, no version-to-
 * generation mapping needed. Strips the \n/\f line-wrap characters PokéAPI
 * embeds for in-game text-box formatting.
 */
function pickFlavorText(entries: PokeApiSpecies["flavor_text_entries"]): string | null {
  const english = entries.filter((e) => e.language.name === "en");
  if (english.length === 0) return null;
  return english[english.length - 1].flavor_text.replace(/[\n\f]/g, " ");
}

function englishName(names: PokeApiLocalizedName[], fallback: string): string {
  return names.find((n) => n.language.name === "en")?.name ?? fallback;
}

function bestSprite(sprites: PokeApiSprites, shiny: boolean): string {
  const oa = sprites.other?.["official-artwork"];
  const home = sprites.other?.home;
  const fromOa = shiny ? oa?.front_shiny : oa?.front_default;
  if (fromOa) return fromOa;
  const fromHome = shiny ? home?.front_shiny : home?.front_default;
  if (fromHome) return fromHome;
  const fallback = shiny ? sprites.front_shiny : sprites.front_default;
  return fallback ?? "";
}

/**
 * Gender-difference sprites only ever appear in the base `sprites.front_female`/
 * `front_shiny_female` fields, never in the official-artwork/home sub-objects —
 * unlike bestSprite() there's no fallback chain to walk.
 */
function femaleSprite(sprites: PokeApiSprites, shiny: boolean): string | null {
  return shiny ? sprites.front_shiny_female : sprites.front_female;
}

function statAt100(base: number, isHp: boolean): number {
  return isHp ? 2 * base + 141 : 2 * base + 36;
}

function generationNumberFromName(name: string): number {
  // "generation-i" .. "generation-ix"
  const roman = name.split("-")[1]?.toUpperCase() ?? "";
  const romanToInt: Record<string, number> = {
    I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9,
  };
  return romanToInt[roman] ?? 0;
}

function extractStats(stats: PokeApiPokemon["stats"]): Pick<FetchedVariety, "statHp" | "statAttack" | "statDefense" | "statSpecialAttack" | "statSpecialDefense" | "statSpeed" | "statTotal"> {
  const base = (name: string) => stats.find((s) => s.stat.name === name)?.base_stat ?? 0;
  const statHp = statAt100(base("hp"), true);
  const statAttack = statAt100(base("attack"), false);
  const statDefense = statAt100(base("defense"), false);
  const statSpecialAttack = statAt100(base("special-attack"), false);
  const statSpecialDefense = statAt100(base("special-defense"), false);
  const statSpeed = statAt100(base("speed"), false);
  return {
    statHp, statAttack, statDefense, statSpecialAttack, statSpecialDefense, statSpeed,
    statTotal: statHp + statAttack + statDefense + statSpecialAttack + statSpecialDefense + statSpeed,
  };
}

/** EV (effort value) yield per stat — raw PokéAPI `effort`, distinct from the level-100 statAt100 transform above. */
function extractEvYield(stats: PokeApiPokemon["stats"]): Pick<FetchedVariety, "evYieldHp" | "evYieldAttack" | "evYieldDefense" | "evYieldSpecialAttack" | "evYieldSpecialDefense" | "evYieldSpeed"> {
  const effort = (name: string) => stats.find((s) => s.stat.name === name)?.effort ?? 0;
  return {
    evYieldHp: effort("hp"),
    evYieldAttack: effort("attack"),
    evYieldDefense: effort("defense"),
    evYieldSpecialAttack: effort("special-attack"),
    evYieldSpecialDefense: effort("special-defense"),
    evYieldSpeed: effort("speed"),
  };
}

/**
 * Title-cases a kebab-case PokéAPI form_name slug for display, e.g.
 * "wellspring-mask" -> "Wellspring Mask". Same logic as src/lib/labels.ts's
 * humanize() — duplicated, not imported, since tools/seed-gen is a separate
 * Node package with no import path into the frontend's src/lib/.
 */
function humanizeFormName(slug: string): string {
  return slug.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/**
 * Determines a cosmetic form's kind from its PokéAPI form flags. Any other
 * `is_battle_only` form (Zen Mode, Primal Reversion, Blade Aegislash, ...)
 * uses its own `form_name` directly as `kind` — confirmed live that
 * PokéAPI's `is_battle_only` flag correctly identifies every one of these
 * (GROUP_A_FORM_NAMES intercepts the handful of misleadingly-flagged
 * exceptions, like Crowned Zacian/Zamazenta, before this function is ever
 * called). Eternamax Eternatus is the one explicit exception even within
 * this battle-only bucket — confirmed via Bulbapedia that it's flagged
 * "unobtainable," never player-visible outside one move animation, not
 * worth even a cosmetic_forms row.
 */
function cosmeticFormKind(form: PokeApiForm): CosmeticFormKind | undefined {
  if (form.is_mega) {
    if (form.form_name === "mega-x") return "mega_x";
    if (form.form_name === "mega-y") return "mega_y";
    return "mega";
  }
  if (form.form_name === "gmax") return "gmax";
  if ((form.is_battle_only || FORCE_COSMETIC_FORM_NAMES.has(form.form_name)) && form.form_name !== "eternamax") {
    return form.form_name;
  }
  return undefined;
}

/**
 * Every additional sprite PokéAPI attaches to ONE variety's own `pokemon`
 * resource (`pokemon.forms`, not `species.varieties`) — a structurally
 * different shape than every other form this pipeline tracks, confirmed
 * live for Shellos/Gastrodon (West/East Sea), Arceus/Silvally (18
 * Plate/Memory types each), Unown (28 letters), Vivillon/Scatterbug/Spewpa
 * (20 regional patterns each), Alcremie (63 cream/sweet combinations),
 * Furfrou (10 trims), Genesect (4 Drives), Deerling/Sawsbuck (4 seasons),
 * Floette's family (5 flower colors per stage), Burmy/Mothim, Cherrim
 * (Sunshine — confirmed via a live DB check this was NOT actually already
 * tracked despite an earlier round's documentation claiming it was: Cherrim
 * has only one `species.varieties` entry, so the existing per-variety
 * `is_battle_only` cosmetic path never even runs for it), Xerneas (Active
 * Mode), and Sinistea/Polteageist/Sinistcha/Poltchageist's Antique/Artisan/
 * Masterpiece forms. None of these have their own separate stat block
 * (confirmed: they're all attached to the SAME `pokemon` resource, sharing
 * its stats/abilities/height/weight) — they exist purely to be displayed,
 * so every field but sprite/type/displayName is copied from `shared`.
 * `types` is taken from the FORM's own (confirmed real per-form override —
 * Arceus's "fire" form really does report Fire-type) when present, falling
 * back to the parent variety's types when a form has no override.
 *
 * The form flagged `is_default` is always the variety's own baseline
 * appearance (confirmed live: Unown's bare sprite is byte-identical to its
 * "unown-a" form's) — skipped, since `shared.spriteUrl` already captures
 * it. Forms named "female" are also skipped — confirmed live (Frillish/
 * Jellicent/Pyroar, whose default variety is itself named "{species}-male")
 * that this is exactly the same sprite `femaleSprite()` already extracts
 * from the bare `pokemon.sprites.front_female` field, just exposed a second
 * time via the forms mechanism; tracking it again here would duplicate the
 * existing gender-difference sprite tile rather than add anything new.
 */
async function extraSpriteForms(
  limiter: ConcurrencyLimiter,
  pokemon: PokeApiPokemon,
  ownFormId: number,
  shared: Omit<FetchedCosmeticForm, "pokemonId" | "baseFormId" | "apiPokemonName" | "kind" | "displayName" | "spriteUrl" | "shinySpriteUrl" | "spriteCropX" | "spriteCropY" | "spriteCropWidth" | "spriteCropHeight" | "spriteCropXShiny" | "spriteCropYShiny" | "spriteCropWidthShiny" | "spriteCropHeightShiny" | "megaStoneItem">,
): Promise<FetchedCosmeticForm[]> {
  if (pokemon.forms.length <= 1) return [];
  const extras: FetchedCosmeticForm[] = [];
  for (const formRef of pokemon.forms) {
    const form = await limiter.run(() => cachedJson<PokeApiForm>("pokeapi-form", formRef.name, formRef.url));
    if (form.is_default || form.form_name === "female") continue;
    const spriteUrl = bestSprite(form.sprites, false);
    const shinySpriteUrl = bestSprite(form.sprites, true);
    const crop = await limiter.run(() => cachedSpriteCrop(spriteUrl));
    const cropShiny = await limiter.run(() => cachedSpriteCrop(shinySpriteUrl));
    extras.push({
      // `shared` spreads FIRST — it's the parent variety's own sprite/types/
      // stats, used as the fallback for everything this form doesn't
      // override. Every per-form value (sprite/shiny sprite/types/kind/
      // display name) is set AFTER the spread specifically so it WINS —
      // confirmed live this was backwards in an earlier version (`...shared`
      // spread last clobbered the per-form sprite URLs with the parent's
      // own, so every Unown letter rendered the identical base sprite).
      ...shared,
      pokemonId: 0, // filled in by the caller, which knows the species id
      baseFormId: ownFormId,
      apiPokemonName: formRef.name,
      kind: form.form_name,
      displayName: englishName(form.names, pokemon.name),
      spriteUrl,
      shinySpriteUrl,
      spriteCropX: crop.x,
      spriteCropY: crop.y,
      spriteCropWidth: crop.width,
      spriteCropHeight: crop.height,
      spriteCropXShiny: cropShiny.x,
      spriteCropYShiny: cropShiny.y,
      spriteCropWidthShiny: cropShiny.width,
      spriteCropHeightShiny: cropShiny.height,
      megaStoneItem: null,
      types: form.types.length > 0 ? form.types.map((t) => t.type.name) : shared.types,
    });
  }
  return extras;
}

async function fetchVarietyDetail(
  limiter: ConcurrencyLimiter,
  variety: { is_default: boolean; pokemon: PokeApiNamedResource },
  fallbackDisplayName: string,
  formIndex: number,
  speciesName: string,
  megaStoneMap: Map<string, string>,
): Promise<{ variety?: FetchedVariety; cosmeticForm?: FetchedCosmeticForm; extraCosmeticForms: FetchedCosmeticForm[] }> {
  const pokemon = await limiter.run(() => cachedJson<PokeApiPokemon>("pokeapi-pokemon", variety.pokemon.name, variety.pokemon.url));
  const spriteUrl = bestSprite(pokemon.sprites, false);
  const shinySpriteUrl = bestSprite(pokemon.sprites, true);
  const spriteUrlFemale = femaleSprite(pokemon.sprites, false);
  const shinySpriteUrlFemale = femaleSprite(pokemon.sprites, true);
  // Computed unconditionally, not just for the cosmetic-form sprite sources
  // that originally motivated this — bestSprite()'s own fallback chain
  // (official-artwork -> home -> the same small/padded basic sprite every
  // pokemon-form resource is stuck with) means a real `pokemon` row's own
  // sprite could in principle hit the identical bug if a future species/
  // variety ever lacks official-artwork/home sprites, even though none
  // currently do. Each of the 4 sprite slots (standard/female/shiny/shiny
  // female) gets its OWN independently-measured crop — confirmed via a real
  // user-reported bug (Hisuian Lilligant) that a shiny recolor's alpha shape
  // can genuinely differ from its non-shiny counterpart's (its sparkle
  // highlight extends further), not just a palette swap on the same shape
  // the way it happens to for some other species (Unown). FULL_CANVAS_CROP
  // for the two female slots when there's no gender-difference sprite at all.
  const spriteCrop = await limiter.run(() => cachedSpriteCrop(spriteUrl));
  const spriteCropShiny = await limiter.run(() => cachedSpriteCrop(shinySpriteUrl));
  const spriteCropFemale = spriteUrlFemale ? await limiter.run(() => cachedSpriteCrop(spriteUrlFemale)) : FULL_CANVAS_CROP;
  const spriteCropShinyFemale = shinySpriteUrlFemale ? await limiter.run(() => cachedSpriteCrop(shinySpriteUrlFemale)) : FULL_CANVAS_CROP;
  const shared = {
    types: pokemon.types.map((t) => t.type.name),
    spriteUrl,
    shinySpriteUrl,
    spriteUrlFemale,
    shinySpriteUrlFemale,
    spriteCropX: spriteCrop.x,
    spriteCropY: spriteCrop.y,
    spriteCropWidth: spriteCrop.width,
    spriteCropHeight: spriteCrop.height,
    spriteCropXShiny: spriteCropShiny.x,
    spriteCropYShiny: spriteCropShiny.y,
    spriteCropWidthShiny: spriteCropShiny.width,
    spriteCropHeightShiny: spriteCropShiny.height,
    spriteCropXFemale: spriteCropFemale.x,
    spriteCropYFemale: spriteCropFemale.y,
    spriteCropWidthFemale: spriteCropFemale.width,
    spriteCropHeightFemale: spriteCropFemale.height,
    spriteCropXShinyFemale: spriteCropShinyFemale.x,
    spriteCropYShinyFemale: spriteCropShinyFemale.y,
    spriteCropWidthShinyFemale: spriteCropShinyFemale.width,
    spriteCropHeightShinyFemale: spriteCropShinyFemale.height,
    height: pokemon.height,
    weight: pokemon.weight,
    abilities: pokemon.abilities.map((a) => ({ name: a.ability.name, isHidden: a.is_hidden })),
    ...extractStats(pokemon.stats),
    baseExperience: pokemon.base_experience ?? 0,
    ...extractEvYield(pokemon.stats),
  };
  // Computed unconditionally and threaded through every return path below —
  // a variety can have extra display-only sprites attached regardless of
  // whether the variety itself ends up as a real `pokemon` row, a
  // cosmeticForm (Mega/Gmax/Minior Core/...), or dropped entirely (none of
  // this dataset's currently-dropped varieties happen to have any extras of
  // their own, but nothing should assume that stays true forever).
  const ownFormId = variety.is_default ? 0 : formIndex;
  const extraCosmeticForms = await extraSpriteForms(limiter, pokemon, ownFormId, shared);

  if (!variety.is_default) {
    const formRef = pokemon.forms[0];
    if (!formRef) return { extraCosmeticForms };
    const form = await limiter.run(() => cachedJson<PokeApiForm>("pokeapi-form", formRef.name, formRef.url));
    // GROUP_A_FORM_NAMES takes priority over is_battle_only — PokéAPI's flag
    // misleadingly marks a few real, persistent forms this way (Crowned
    // Zacian/Zamazenta), confirmed live against Bulbapedia. Mega/Gmax are
    // never in that list (they're real cosmetic-only transformations), so
    // this never short-circuits the existing Mega/Gmax path. FORCE_COSMETIC_
    // FORM_NAMES is the opposite override — Minior's Core forms are real,
    // battle-only/reverting states that PokéAPI flags `is_battle_only:
    // false` (confirmed backwards), so without this they'd fall through to
    // the regional/Group A check below and get silently dropped instead of
    // routed to cosmetic_forms.
    if (
      !GROUP_A_FORM_NAMES.has(form.form_name) &&
      (form.is_battle_only || form.is_mega || FORCE_COSMETIC_FORM_NAMES.has(form.form_name))
    ) {
      const kind = cosmeticFormKind(form);
      if (!kind) return { extraCosmeticForms }; // other battle-only cosmetic (Crowned, Eternamax, ...) — not modeled
      // shared.spriteCrop* was already computed from this exact spriteUrl
      // above — no need to hit cachedSpriteCrop's cache a second time.
      return {
        extraCosmeticForms,
        cosmeticForm: {
          pokemonId: 0, // filled in by the caller, which knows the species id
          baseFormId: 0, // placeholder — the caller re-resolves this via resolveCosmeticBaseFormId once the species' full varieties list is known
          apiPokemonName: pokemon.name,
          kind,
          displayName: englishName(form.names, pokemon.name),
          spriteUrl: shared.spriteUrl,
          shinySpriteUrl: shared.shinySpriteUrl,
          spriteCropX: shared.spriteCropX,
          spriteCropY: shared.spriteCropY,
          spriteCropWidth: shared.spriteCropWidth,
          spriteCropHeight: shared.spriteCropHeight,
          spriteCropXShiny: shared.spriteCropXShiny,
          spriteCropYShiny: shared.spriteCropYShiny,
          spriteCropWidthShiny: shared.spriteCropWidthShiny,
          spriteCropHeightShiny: shared.spriteCropHeightShiny,
          megaStoneItem: kind === "gmax" ? null : megaStoneMap.get(`${speciesName}:${kind}`) ?? null,
          types: shared.types,
          height: shared.height,
          weight: shared.weight,
          abilities: shared.abilities,
          statHp: shared.statHp,
          statAttack: shared.statAttack,
          statDefense: shared.statDefense,
          statSpecialAttack: shared.statSpecialAttack,
          statSpecialDefense: shared.statSpecialDefense,
          statSpeed: shared.statSpeed,
          statTotal: shared.statTotal,
          baseExperience: shared.baseExperience,
          evYieldHp: shared.evYieldHp,
          evYieldAttack: shared.evYieldAttack,
          evYieldDefense: shared.evYieldDefense,
          evYieldSpecialAttack: shared.evYieldSpecialAttack,
          evYieldSpecialDefense: shared.evYieldSpecialDefense,
          evYieldSpeed: shared.evYieldSpeed,
        },
      };
    }
    // Strip a leading "Standard " qualifier — PokéAPI's English name for
    // Darmanitan's non-Zen forms (Kantonian and Galarian both) is "Standard
    // <Adjective> Darmanitan"/"Standard Darmanitan", disambiguating against
    // the Zen-Mode variety. This app never tracks Zen Mode at all (a
    // battle-only transformation, the same modeling reasoning that already
    // excludes Mega/Gmax from `pokemon` rows), so for the one tracked
    // variety here there's nothing left to disambiguate against — "Standard
    // Galarian Darmanitan" should just read "Galarian Darmanitan", matching
    // every other regional form's "<Adjective> <Species>" naming. Confirmed
    // via a direct DB query that Darmanitan is the only species in this
    // dataset where this qualifier appears at all.
    const formDisplayName = englishName(form.names, pokemon.name).replace(/^Standard /, "");
    // "Totem Alolan Marowak"/"Totem Alolan Raticate" are a real PokéAPI
    // variety, not battle_only/is_mega per PokéAPI's own flags, but
    // confirmed live (Bulbapedia's "Totem Pokémon" article) that the boosted
    // Totem state itself can never be caught or owned — SM/USUM's "island
    // challenge rules" make it a fixed, uncatchable trial encounter, the
    // game-mechanic equivalent of battle-only despite PokéAPI not flagging
    // it that way. Exclude explicitly, before the regional-adjective check
    // below (which "Totem Alolan Marowak" would otherwise also pass).
    if (/\bTotem\b/.test(formDisplayName)) return { extraCosmeticForms };
    const adjective = REGIONAL_ADJECTIVES.find((adj) => new RegExp(`\\b${adj}\\b`).test(formDisplayName));
    const groupAName = GROUP_A_FORM_NAMES.has(form.form_name) ? humanizeFormName(form.form_name) : undefined;
    const formName = adjective ?? groupAName;
    if (!formName) return { extraCosmeticForms }; // cosmetic-only variant (pattern/cap/season/etc.) — not modeled

    const versionGroup = await limiter.run(() =>
      cachedJson<PokeApiVersionGroup>("pokeapi-version-group", form.version_group.name, form.version_group.url),
    );
    const override = PARTNER_FORM_OVERRIDES[formName];
    return {
      extraCosmeticForms,
      variety: {
        formId: formIndex,
        formName,
        displayName: formDisplayName,
        apiPokemonName: variety.pokemon.name,
        generationNumber: generationNumberFromName(versionGroup.generation.name),
        genderRate: override?.genderRate,
        growthRate: override?.growthRate,
        ...shared,
      },
    };
  }

  return {
    extraCosmeticForms,
    variety: {
      formId: 0,
      formName: null,
      displayName: fallbackDisplayName,
      apiPokemonName: variety.pokemon.name,
      generationNumber: 0, // placeholder — the caller patches this to the species' own generation once back in scope
      ...shared,
    },
  };
}

export async function fetchAllSpecies(): Promise<{ species: FetchedSpecies[]; cosmeticForms: FetchedCosmeticForm[] }> {
  const list = await cachedJson<PokeApiSpeciesList>("pokeapi-species-list", "all", `${POKEAPI_BASE}/pokemon-species?limit=2000`);
  const limiter = new ConcurrencyLimiter(8);
  const megaStoneMap = await fetchMegaStoneMap();
  const out: FetchedSpecies[] = [];
  const cosmeticForms: FetchedCosmeticForm[] = [];

  const limit = process.env.SEED_GEN_LIMIT ? Number(process.env.SEED_GEN_LIMIT) : undefined;
  const targets = limit ? list.results.slice(0, limit) : list.results;

  // NB: each task below issues several *nested* network requests (species,
  // then per-variety pokemon + form). The ConcurrencyLimiter is only ever
  // acquired around individual leaf fetches (inside cachedJson call sites),
  // never around this whole per-species task — wrapping the outer task in
  // the same limiter would deadlock once `max` tasks are concurrently
  // holding an outer slot while each waits on an inner slot from the same
  // limiter that's already fully checked out.
  let done = 0;
  await Promise.all(
    targets.map(async (ref) => {
      const species = await limiter.run(() => cachedJson<PokeApiSpecies>("pokeapi-species", ref.name, ref.url));
      const displayName = englishName(species.names, species.name);
      const isBreedable = !species.egg_groups.some((g) => g.name === "no-eggs");
      const speciesGenerationNumber = generationNumberFromName(species.generation.name);

      const varieties: FetchedVariety[] = [];
      const speciesCosmeticForms: FetchedCosmeticForm[] = [];
      const speciesExtraCosmeticForms: FetchedCosmeticForm[] = [];
      let formIndex = 1;
      for (const variety of species.varieties) {
        const { variety: detail, cosmeticForm, extraCosmeticForms } = await fetchVarietyDetail(
          limiter, variety, displayName, variety.is_default ? 0 : formIndex, species.name, megaStoneMap,
        );
        if (detail) {
          // The default variety's generation is the species' own — fetchVarietyDetail
          // returns a placeholder for it since it has no version_group of its own to
          // derive from (only non-default varieties do); patched here rather than
          // threaded down as a parameter, matching this file's own established
          // two-pass pattern for resolveCosmeticBaseFormId below.
          if (variety.is_default) detail.generationNumber = speciesGenerationNumber;
          varieties.push(detail);
          if (!variety.is_default) formIndex++;
        }
        if (cosmeticForm) {
          speciesCosmeticForms.push(cosmeticForm);
        }
        speciesExtraCosmeticForms.push(...extraCosmeticForms);
      }
      varieties.sort((a, b) => a.formId - b.formId);
      // baseFormId resolution needs the species' FULL varieties list (e.g.
      // Galarian Darmanitan's own formId must already be known to attach its
      // Zen Mode cosmetic form to it instead of the base form), so it can't
      // happen inside fetchVarietyDetail, which only sees one variety at a time.
      for (const cosmeticForm of speciesCosmeticForms) {
        cosmeticForms.push({
          ...cosmeticForm,
          pokemonId: species.id,
          baseFormId: resolveCosmeticBaseFormId(cosmeticForm.apiPokemonName, cosmeticForm.kind, varieties),
        });
      }
      // extraCosmeticForms already know their own correct baseFormId (the
      // exact variety they were fetched alongside, no guessing needed the
      // way resolveCosmeticBaseFormId's kind-string-matching does above).
      for (const extra of speciesExtraCosmeticForms) {
        cosmeticForms.push({ ...extra, pokemonId: species.id });
      }

      out.push({
        pokemonId: species.id,
        name: species.name,
        displayName,
        generationNumber: speciesGenerationNumber,
        genderRate: species.gender_rate,
        hasGenderDifferences: species.has_gender_differences,
        isLegendary: species.is_legendary,
        isMythical: species.is_mythical,
        isBaby: species.is_baby,
        isBreedable,
        hatchSteps: species.hatch_counter * 255,
        color: species.color.name,
        shape: species.shape?.name ?? null,
        growthRate: species.growth_rate.name,
        eggGroups: species.egg_groups.map((g) => g.name),
        captureRate: species.capture_rate,
        baseHappiness: species.base_happiness,
        evolutionChainUrl: species.evolution_chain.url,
        flavorText: pickFlavorText(species.flavor_text_entries),
        varieties,
      });

      done++;
      if (done % 100 === 0) console.log(`  fetched ${done}/${targets.length} species`);
    })
  );

  out.sort((a, b) => a.pokemonId - b.pokemonId);
  cosmeticForms.sort((a, b) => a.pokemonId - b.pokemonId);
  return { species: out, cosmeticForms };
}

export async function runFetchPokeapi(): Promise<FetchedSpecies[]> {
  console.log(`fetchPokeapi: fetching species metadata from PokéAPI...`);
  const { species, cosmeticForms } = await fetchAllSpecies();
  await writeOutJson("species.json", species);
  await writeOutJson("cosmetic-forms-raw.json", cosmeticForms);
  console.log(`fetchPokeapi: wrote ${species.length} species to out/species.json, ${cosmeticForms.length} cosmetic forms to out/cosmetic-forms-raw.json`);
  return species;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchPokeapi().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
