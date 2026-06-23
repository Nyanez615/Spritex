/**
 * End-to-end pipeline: PokéAPI + Bulbapedia -> resources/static.db.
 * Each stage caches/writes its own intermediate output, so re-running after
 * a partial failure resumes cheaply rather than re-fetching everything.
 */
import { runFetchPokeapi } from "./fetchPokeapi.js";
import { runFetchEvolutionChains } from "./fetchEvolutionChains.js";
import { runScrapeBulbapedia } from "./scrapeBulbapedia.js";
import { runScrapeShinyLocks } from "./scrapeShinyLocks.js";
import { runScrapeDynamaxAdventure } from "./scrapeDynamaxAdventure.js";
import { runScrapeFriendSafari } from "./scrapeFriendSafari.js";
import { runDeriveShinyMethods } from "./deriveShinyMethods.js";
import { runBuildStaticDb } from "./buildStaticDb.js";

async function main() {
  console.log("=== 1/8 fetchPokeapi ===");
  await runFetchPokeapi();
  console.log("=== 2/8 fetchEvolutionChains ===");
  await runFetchEvolutionChains();
  console.log("=== 3/8 scrapeBulbapedia ===");
  await runScrapeBulbapedia();
  console.log("=== 4/8 scrapeShinyLocks ===");
  await runScrapeShinyLocks();
  console.log("=== 5/8 scrapeDynamaxAdventure ===");
  await runScrapeDynamaxAdventure();
  console.log("=== 6/8 scrapeFriendSafari ===");
  await runScrapeFriendSafari();
  console.log("=== 7/8 deriveShinyMethods ===");
  await runDeriveShinyMethods();
  console.log("=== 8/8 buildStaticDb ===");
  await runBuildStaticDb();
  console.log("=== done ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
