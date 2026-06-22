/** Parses the JSON-encoded string arrays models.rs stores for types/boost_requirements. */
export const parseJsonArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** odds_* fields are denominators — 4096 means "1 in 4096", never a raw probability. */
export const formatOdds = (denominator: number): string => `1/${denominator.toLocaleString()}`;

/** gender_rate: -1 genderless, 0 always male, 8 always female, else eighths female. */
export const formatGenderRate = (rate: number): string => {
  if (rate === -1) return "Genderless";
  if (rate === 0) return "Male only";
  if (rate === 8) return "Female only";
  return `${Math.round((rate / 8) * 100)}% female`;
};

/** Duck-typed instead of `instanceof Error` — rejections from tauri.ts wrappers can cross module/realm boundaries during HMR. */
export const errorMessage = (err: unknown): string | null => {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return null;
};
