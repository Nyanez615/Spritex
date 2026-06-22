/**
 * End-to-end pipeline: PokéAPI + Bulbapedia -> resources/static.db.
 * Each stage caches/writes its own intermediate output, so re-running after
 * a partial failure resumes cheaply rather than re-fetching everything.
 */
import { runFetchPokeapi } from "./fetchPokeapi.js";
import { runScrapeBulbapedia } from "./scrapeBulbapedia.js";
import { runScrapeShinyLocks } from "./scrapeShinyLocks.js";
import { runScrapeDynamaxAdventure } from "./scrapeDynamaxAdventure.js";
import { runScrapeFriendSafari } from "./scrapeFriendSafari.js";
import { runDeriveShinyMethods } from "./deriveShinyMethods.js";
import { runBuildStaticDb } from "./buildStaticDb.js";

async function main() {
  console.log("=== 1/7 fetchPokeapi ===");
  await runFetchPokeapi();
  console.log("=== 2/7 scrapeBulbapedia ===");
  await runScrapeBulbapedia();
  console.log("=== 3/7 scrapeShinyLocks ===");
  await runScrapeShinyLocks();
  console.log("=== 4/7 scrapeDynamaxAdventure ===");
  await runScrapeDynamaxAdventure();
  console.log("=== 5/7 scrapeFriendSafari ===");
  await runScrapeFriendSafari();
  console.log("=== 6/7 deriveShinyMethods ===");
  await runDeriveShinyMethods();
  console.log("=== 7/7 buildStaticDb ===");
  await runBuildStaticDb();
  console.log("=== done ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
