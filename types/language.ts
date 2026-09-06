export type LanguageCode = "en" | "fr" | "es" | "de" | "pt" | "it" | "yo";

export interface Language {
  code: LanguageCode;
  /** English name, e.g. "French" */
  label: string;
  /** Name in the language itself, e.g. "Français" */
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  // Not offered on calls: AssemblyAI's streaming models have no Yoruba, so
  // a Yoruba speaker's own words would never transcribe. See
  // CallLanguageCode in types/account.ts.
  { code: "yo", label: "Yoruba", nativeLabel: "Yorùbá" },
];

export function getLanguage(code: string | null | undefined): Language | undefined {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code);
}

/**
 * Any language OHUN has a translator prompt for — chat and voice notes,
 * where there is no live speech-to-text model to worry about. Narrower for
 * calls: see CallLanguageCode in ./account.
 */
export function isSupportedLanguage(value: unknown): value is LanguageCode {
  return typeof value === "string" && SUPPORTED_LANGUAGES.some((language) => language.code === value);
}
