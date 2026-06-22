import { cachedJson } from "./httpCache.js";

const API_BASE = "https://bulbapedia.bulbagarden.net/w/api.php";

interface MediaWikiSection {
  index: string;
  line: string;
}

interface ParseSectionsResponse {
  error?: { code: string; info: string };
  parse?: { title: string; sections: MediaWikiSection[] };
}

interface ParseWikitextResponse {
  error?: { code: string; info: string };
  parse?: { wikitext: { "*": string } };
}

export interface PageSection {
  canonicalTitle: string;
  wikitext: string;
}

/**
 * Resolves `page` (following redirects) and returns the wikitext of the
 * first section whose heading matches `sectionHeading` exactly, or
 * undefined if the page doesn't exist or has no such section.
 */
export async function fetchNamedSection(page: string, sectionHeading: string): Promise<PageSection | undefined> {
  const sectionsUrl = `${API_BASE}?action=parse&page=${encodeURIComponent(page)}&redirects=true&prop=sections&format=json`;
  const sectionsRes = await cachedJson<ParseSectionsResponse>("bulbapedia-sections", page, sectionsUrl);
  if (sectionsRes.error || !sectionsRes.parse) return undefined;

  const section = sectionsRes.parse.sections.find((s) => s.line === sectionHeading);
  if (!section) return undefined;

  const wikitextUrl = `${API_BASE}?action=parse&page=${encodeURIComponent(page)}&redirects=true&prop=wikitext&section=${section.index}&format=json`;
  const wikitextRes = await cachedJson<ParseWikitextResponse>("bulbapedia-wikitext", `${page}#${section.index}`, wikitextUrl);
  if (wikitextRes.error || !wikitextRes.parse) return undefined;

  return { canonicalTitle: sectionsRes.parse.title, wikitext: wikitextRes.parse.wikitext["*"] };
}

/** Fetches the full wikitext of a page (no section slicing) — used for pages parsed structurally rather than by heading, like the shiny-locks list. */
export async function fetchFullWikitext(page: string): Promise<string | undefined> {
  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(page)}&redirects=true&prop=wikitext&format=json`;
  const res = await cachedJson<ParseWikitextResponse>("bulbapedia-wikitext-full", page, url);
  if (res.error || !res.parse) return undefined;
  return res.parse.wikitext["*"];
}

export function pageUrl(canonicalTitle: string): string {
  return `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(canonicalTitle.replace(/ /g, "_"))}`;
}
