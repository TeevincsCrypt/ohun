export type LanguageCode = "en" | "fr" | "es" | "yo";

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
  { code: "yo", label: "Yoruba", nativeLabel: "Yorùbá" },
];

export function getLanguage(code: string | null | undefined): Language | undefined {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code);
}
