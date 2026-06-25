use serde::{Deserialize, Serialize};
use std::str::FromStr;
use ts_rs::TS;

/// Audited against Bulbapedia's full `Pokémon games` index (120+ titles) for every
/// game — core or side — with a real mechanism to put a PID-bearing Pokémon into a
/// game that eventually reaches HOME, not just battle with borrowed/virtual ones.
/// Deliberately excluded, with reasons checked rather than assumed:
/// - **Pokémon Champions** — recruited Pokémon can't be deposited to HOME; a
///   one-way borrow-and-return loop with no shiny-acquisition mechanic of its own
///   (same reasoning that already excludes Pal-Park-style pure transfers).
/// - **Pokémon Pinball: Ruby & Sapphire** — confirmed via direct research to have
///   no transfer feature at all, despite a common assumption otherwise.
/// - **PokéPark Wii / PokéPark 2** — no evidence found of any Pokémon-transfer mechanism.
/// - **Pokémon Stadium / Stadium 2, Pokémon Box, Pokémon Bank, Pokémon HOME itself**
///   — relay/storage/battle-simulator infrastructure that moves existing Pokémon,
///   not a catching mechanic that creates new ones.
/// - The entire TCG/puzzle/rhythm/photography/edutainment catalog (Trading Card Game,
///   Puzzle League, Trozei, Shuffle, Pokkén, Detective Pikachu, Snap, Conquest,
///   Mystery Dungeon, Rumble, Duel, Magikarp Jump, Quest, and the rest of Bulbapedia's
///   ~80-title minigame/spinoff long tail) — none create a real Pokémon instance.
/// - **Pokémon Winds and Waves** — real, confirmed via independent official Nintendo
///   sources, but announced for 2027 — hasn't released, so there's nothing to scrape
///   yet; a known near-future addition, not modeled speculatively.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum Game {
    Gen1Vc,
    Gen2Vc,
    Gen3Rs,
    Gen3E,
    Gen3Frlg,
    Colosseum,
    Xd,
    Gen4Dp,
    Gen4Pt,
    Gen4Hgss,
    Ranger,
    RangerSoa,
    DreamWorld,
    DreamRadar,
    RangerGs,
    Gen5Bw,
    Gen5B2W2,
    Gen6Xy,
    Gen6Oras,
    Gen7Sm,
    Gen7Usum,
    Lgpe,
    Swsh,
    Bdsp,
    Pla,
    Sv,
    LegendsZa,
    Go,
}

impl Game {
    /// Stable snake_case string used for SQLite TEXT storage — kept separate
    /// from serde's JSON form so the DB never carries quote characters.
    pub fn as_str(&self) -> &'static str {
        match self {
            Game::Gen1Vc => "gen1_vc",
            Game::Gen2Vc => "gen2_vc",
            Game::Gen3Rs => "gen3_rs",
            Game::Gen3E => "gen3_e",
            Game::Gen3Frlg => "gen3_frlg",
            Game::Colosseum => "colosseum",
            Game::Xd => "xd",
            Game::Gen4Dp => "gen4_dp",
            Game::Gen4Pt => "gen4_pt",
            Game::Gen4Hgss => "gen4_hgss",
            Game::Ranger => "ranger",
            Game::RangerSoa => "ranger_soa",
            Game::DreamWorld => "dream_world",
            Game::DreamRadar => "dream_radar",
            Game::RangerGs => "ranger_gs",
            Game::Gen5Bw => "gen5_bw",
            // Matches serde's derived snake_case for this variant exactly
            // (it splits on the digit→letter boundary too: "b2_w2", not "b2w2") —
            // kept in sync so SQLite TEXT storage matches the IPC/TS wire format.
            Game::Gen5B2W2 => "gen5_b2_w2",
            Game::Gen6Xy => "gen6_xy",
            Game::Gen6Oras => "gen6_oras",
            Game::Gen7Sm => "gen7_sm",
            Game::Gen7Usum => "gen7_usum",
            Game::Lgpe => "lgpe",
            Game::Swsh => "swsh",
            Game::Bdsp => "bdsp",
            Game::Pla => "pla",
            Game::Sv => "sv",
            Game::LegendsZa => "legends_za",
            Game::Go => "go",
        }
    }
}

impl FromStr for Game {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "gen1_vc" => Ok(Game::Gen1Vc),
            "gen2_vc" => Ok(Game::Gen2Vc),
            "gen3_rs" => Ok(Game::Gen3Rs),
            "gen3_e" => Ok(Game::Gen3E),
            "gen3_frlg" => Ok(Game::Gen3Frlg),
            "colosseum" => Ok(Game::Colosseum),
            "xd" => Ok(Game::Xd),
            "gen4_dp" => Ok(Game::Gen4Dp),
            "gen4_pt" => Ok(Game::Gen4Pt),
            "gen4_hgss" => Ok(Game::Gen4Hgss),
            "ranger" => Ok(Game::Ranger),
            "ranger_soa" => Ok(Game::RangerSoa),
            "dream_world" => Ok(Game::DreamWorld),
            "dream_radar" => Ok(Game::DreamRadar),
            "ranger_gs" => Ok(Game::RangerGs),
            "gen5_bw" => Ok(Game::Gen5Bw),
            "gen5_b2_w2" => Ok(Game::Gen5B2W2),
            "gen6_xy" => Ok(Game::Gen6Xy),
            "gen6_oras" => Ok(Game::Gen6Oras),
            "gen7_sm" => Ok(Game::Gen7Sm),
            "gen7_usum" => Ok(Game::Gen7Usum),
            "lgpe" => Ok(Game::Lgpe),
            "swsh" => Ok(Game::Swsh),
            "bdsp" => Ok(Game::Bdsp),
            "pla" => Ok(Game::Pla),
            "sv" => Ok(Game::Sv),
            "legends_za" => Ok(Game::LegendsZa),
            "go" => Ok(Game::Go),
            other => Err(format!("unknown game: {other}")),
        }
    }
}

/// If you add a variant here that represents a *repeatable wild-encounter*
/// chaining mechanic (in the spirit of Pokéradar/chain fishing/DexNav/SOS/
/// Catch Combo/Mass Outbreak/Brilliant Pokémon), also add it to
/// `tools/seed-gen/src/deriveShinyMethods.ts`'s `WILD_ONLY_METHODS` Set —
/// nothing in Rust or TS enforces these two lists staying in sync, so a new
/// wild-only method added here would otherwise silently apply to gift/
/// static/trade-only species too (the exact bug class `WILD_ONLY_METHODS`
/// exists to prevent).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum Method {
    Wild,
    SoftReset,
    Breeding,
    Masuda,
    ChainRadar,
    ChainFishing,
    Sos,
    Horde,
    DexNav,
    DexResearch,
    Outbreak,
    DynamaxAdventure,
    CatchCombo,
    Wormhole,
    Event,
    GoWild,
    GoCommunityDay,
    FriendSafari,
    BrilliantPokemon,
}

impl Method {
    pub fn as_str(&self) -> &'static str {
        match self {
            Method::Wild => "wild",
            Method::SoftReset => "soft_reset",
            Method::Breeding => "breeding",
            Method::Masuda => "masuda",
            Method::ChainRadar => "chain_radar",
            Method::ChainFishing => "chain_fishing",
            Method::Sos => "sos",
            Method::Horde => "horde",
            Method::DexNav => "dex_nav",
            Method::DexResearch => "dex_research",
            Method::Outbreak => "outbreak",
            Method::DynamaxAdventure => "dynamax_adventure",
            Method::CatchCombo => "catch_combo",
            Method::Wormhole => "wormhole",
            Method::Event => "event",
            Method::GoWild => "go_wild",
            Method::GoCommunityDay => "go_community_day",
            Method::FriendSafari => "friend_safari",
            Method::BrilliantPokemon => "brilliant_pokemon",
        }
    }
}

impl FromStr for Method {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "wild" => Ok(Method::Wild),
            "soft_reset" => Ok(Method::SoftReset),
            "breeding" => Ok(Method::Breeding),
            "masuda" => Ok(Method::Masuda),
            "chain_radar" => Ok(Method::ChainRadar),
            "chain_fishing" => Ok(Method::ChainFishing),
            "sos" => Ok(Method::Sos),
            "horde" => Ok(Method::Horde),
            "dex_nav" => Ok(Method::DexNav),
            "dex_research" => Ok(Method::DexResearch),
            "outbreak" => Ok(Method::Outbreak),
            "dynamax_adventure" => Ok(Method::DynamaxAdventure),
            "catch_combo" => Ok(Method::CatchCombo),
            "wormhole" => Ok(Method::Wormhole),
            "event" => Ok(Method::Event),
            "go_wild" => Ok(Method::GoWild),
            "go_community_day" => Ok(Method::GoCommunityDay),
            "friend_safari" => Ok(Method::FriendSafari),
            "brilliant_pokemon" => Ok(Method::BrilliantPokemon),
            other => Err(format!("unknown method: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum CollectionStatus {
    NotStarted,
    Hunting,
    Caught,
}

impl CollectionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            CollectionStatus::NotStarted => "not_started",
            CollectionStatus::Hunting => "hunting",
            CollectionStatus::Caught => "caught",
        }
    }
}

impl FromStr for CollectionStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "not_started" => Ok(CollectionStatus::NotStarted),
            "hunting" => Ok(CollectionStatus::Hunting),
            "caught" => Ok(CollectionStatus::Caught),
            other => Err(format!("unknown collection status: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Pokemon {
    pub id: i32,
    pub name: String,
    pub display_name: String,
    pub form_id: i32,
    pub form_name: Option<String>,
    pub generation: i32,
    pub sprite_url: String,
    pub shiny_sprite_url: String,
    /// Gender-difference sprites — None for the ~90% of species with no visual gender difference.
    pub sprite_url_female: Option<String>,
    pub shiny_sprite_url_female: Option<String>,
    /// JSON-encoded array of type names, e.g. `["grass","poison"]`
    pub types: String,
    /// -1 = genderless, 0 = always male, 8 = always female
    pub gender_rate: i32,
    pub is_mythical: bool,
    pub is_legendary: bool,
    pub is_baby: bool,
    pub is_final_evolution: bool,
    pub color: String,
    pub shape: Option<String>,
    pub growth_rate: String,
    /// JSON-encoded array of egg group names, e.g. `["monster","plant"]`
    pub egg_groups: String,
    pub capture_rate: i32,
    pub base_happiness: i32,
    pub height: i32,
    pub weight: i32,
    /// JSON-encoded array of ability names
    pub abilities: String,
    /// Base stats at level 100 — max neutral IVs (31), 0 EVs, neutral nature.
    /// Not raw PokéAPI base_stat values.
    pub stat_hp: i32,
    pub stat_attack: i32,
    pub stat_defense: i32,
    pub stat_special_attack: i32,
    pub stat_special_defense: i32,
    pub stat_speed: i32,
    pub stat_total: i32,
    pub base_experience: i32,
    pub ev_yield_hp: i32,
    pub ev_yield_attack: i32,
    pub ev_yield_defense: i32,
    pub ev_yield_special_attack: i32,
    pub ev_yield_special_defense: i32,
    pub ev_yield_speed: i32,
    pub has_mega_evolution: bool,
    pub has_gigantamax: bool,
    pub has_gender_differences: bool,
    /// Steps to hatch from an egg (PokéAPI's raw hatch_counter in cycles * 255).
    pub hatch_steps: i32,
    /// Latest English Pokédex description PokéAPI has indexed — None only if no English entry exists at all.
    pub flavor_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ShinyMethod {
    pub id: i32,
    pub pokemon_id: i32,
    pub form_id: i32,
    pub game: Game,
    pub method: Method,
    pub odds_base: i32,
    pub odds_charm: i32,
    pub odds_optimized: i32,
    /// JSON-encoded array of boost requirement strings
    pub boost_requirements: String,
    pub is_best_method: bool,
    /// True unless the underlying availability is gift/static/trade/evolution/hatch-only —
    /// drives the frontend's acquisition-method label for the baseline `wild` method row.
    pub is_wild_encounter: bool,
    pub requires_transfer: bool,
    pub transfer_chain: Option<String>,
    pub citation_url: String,
    pub notes: Option<String>,
}

/// Battle-only/contextual cosmetic forms — Mega Evolution, Gigantamax, and
/// (since the form-tracking audit) every other form confirmed to revert the
/// instant you leave its triggering context (Zen Mode, Primal Reversion,
/// Blade Aegislash, Busted Mimikyu, ...). Not distinct dex entries (none of
/// these change shininess or persist in storage), so they never get their
/// own `shiny_methods` rows. `kind` is stringly-typed (not an enum) since
/// it's purely display, with a wide and growing set of values (one per
/// distinct cosmetic transformation — "mega", "mega_x", "mega_y", "gmax",
/// "zen", "primal", "busted", ...) that nothing filters/queries on the way
/// Game/Method do.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CosmeticForm {
    pub id: i32,
    pub pokemon_id: i32,
    pub form_id: i32,
    pub kind: String,
    pub display_name: String,
    pub sprite_url: String,
    pub shiny_sprite_url: String,
    /// PokéAPI item slug, e.g. "venusaurite" — None for Gigantamax (no held item).
    pub mega_stone_item: Option<String>,
    /// JSON-encoded array of type names — Mega/Gmax forms can differ from the base form (e.g. Mega Charizard X is Fire/Dragon, not Fire/Flying).
    pub types: String,
    pub height: i32,
    pub weight: i32,
    /// JSON-encoded array of ability names — Mega forms typically have a single fixed ability, overriding the base form's normal/hidden ability slots.
    pub abilities: String,
    pub stat_hp: i32,
    pub stat_attack: i32,
    pub stat_defense: i32,
    pub stat_special_attack: i32,
    pub stat_special_defense: i32,
    pub stat_speed: i32,
    pub stat_total: i32,
    pub base_experience: i32,
    pub ev_yield_hp: i32,
    pub ev_yield_attack: i32,
    pub ev_yield_defense: i32,
    pub ev_yield_special_attack: i32,
    pub ev_yield_special_defense: i32,
    pub ev_yield_speed: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CollectionEntry {
    pub id: String,
    pub pokemon_id: i32,
    pub form_id: i32,
    pub status: CollectionStatus,
    pub is_shiny: bool,
    pub encounter_count: i32,
    pub has_shiny_charm: bool,
    pub sandwich_active: bool,
    pub outbreak_active: bool,
    pub chain_count: i32,
    pub game_caught: Option<Game>,
    pub method_used: Option<Method>,
    pub caught_at: Option<String>,
    pub notes: Option<String>,
    pub updated_at: String,
    pub synced_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PokedexFilters {
    pub search: Option<String>,
    pub generation: Option<i32>,
    pub legendary_or_mythical_only: Option<bool>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ChecklistField {
    HasShinyCharm,
    SandwichActive,
    OutbreakActive,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum DexGroupBy {
    Generation,
    Type,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DexProgressBucket {
    pub label: String,
    pub caught: i32,
    pub total: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum SyncMode {
    EmbeddedReplica,
    Unconfigured,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SyncStatus {
    pub last_synced_at: Option<String>,
    pub is_online: bool,
    pub mode: SyncMode,
}

#[cfg(test)]
mod tests {
    use super::*;

    // as_str()/FromStr must stay in sync for every variant — a mismatch is a
    // silent SQLite TEXT round-trip failure (write with as_str(), fail to
    // parse back with from_str()), not a compile error. These three tests
    // replace the previous partial (2-of-19 Method variants) coverage.

    #[test]
    fn game_all_variants_round_trip() {
        let variants = [
            Game::Gen1Vc, Game::Gen2Vc, Game::Gen3Rs, Game::Gen3E, Game::Gen3Frlg,
            Game::Colosseum, Game::Xd, Game::Gen4Dp, Game::Gen4Pt, Game::Gen4Hgss,
            Game::Ranger, Game::RangerSoa, Game::DreamWorld, Game::DreamRadar, Game::RangerGs,
            Game::Gen5Bw, Game::Gen5B2W2, Game::Gen6Xy, Game::Gen6Oras, Game::Gen7Sm, Game::Gen7Usum,
            Game::Lgpe, Game::Swsh, Game::Bdsp, Game::Pla, Game::Sv, Game::LegendsZa, Game::Go,
        ];
        assert_eq!(variants.len(), 28, "update this list whenever a Game variant is added or removed");
        for variant in variants {
            assert_eq!(Game::from_str(variant.as_str()), Ok(variant), "{variant:?} didn't round-trip");
        }
    }

    #[test]
    fn method_all_variants_round_trip() {
        let variants = [
            Method::Wild, Method::SoftReset, Method::Breeding, Method::Masuda, Method::ChainRadar,
            Method::ChainFishing, Method::Sos, Method::Horde, Method::DexNav, Method::DexResearch,
            Method::Outbreak, Method::DynamaxAdventure, Method::CatchCombo, Method::Wormhole, Method::Event,
            Method::GoWild, Method::GoCommunityDay, Method::FriendSafari, Method::BrilliantPokemon,
        ];
        assert_eq!(variants.len(), 19, "update this list whenever a Method variant is added or removed");
        for variant in variants {
            assert_eq!(Method::from_str(variant.as_str()), Ok(variant), "{variant:?} didn't round-trip");
        }
    }

    #[test]
    fn collection_status_all_variants_round_trip() {
        let variants = [CollectionStatus::NotStarted, CollectionStatus::Hunting, CollectionStatus::Caught];
        for variant in variants {
            assert_eq!(CollectionStatus::from_str(variant.as_str()), Ok(variant), "{variant:?} didn't round-trip");
        }
    }
}
