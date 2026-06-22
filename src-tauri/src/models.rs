use serde::{Deserialize, Serialize};
use std::str::FromStr;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum Game {
    Gen1Vc,
    Gen2Vc,
    Gen3Rs,
    Gen3E,
    Gen3Frlg,
    Gen4Dp,
    Gen4Pt,
    Gen4Hgss,
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
            Game::Gen4Dp => "gen4_dp",
            Game::Gen4Pt => "gen4_pt",
            Game::Gen4Hgss => "gen4_hgss",
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
            "gen4_dp" => Ok(Game::Gen4Dp),
            "gen4_pt" => Ok(Game::Gen4Pt),
            "gen4_hgss" => Ok(Game::Gen4Hgss),
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
            "go" => Ok(Game::Go),
            other => Err(format!("unknown game: {other}")),
        }
    }
}

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
    /// JSON-encoded array of type names, e.g. `["grass","poison"]`
    pub types: String,
    /// -1 = genderless, 0 = always male, 8 = always female
    pub gender_rate: i32,
    pub is_mythical: bool,
    pub is_legendary: bool,
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
    pub requires_transfer: bool,
    pub transfer_chain: Option<String>,
    pub citation_url: String,
    pub notes: Option<String>,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
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
