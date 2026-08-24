import type { LanguageCode } from "@/types";

export interface TranslationRequest {
  text: string;
  from: LanguageCode;
  to: LanguageCode;
}

export interface TranslationResult {
  translatedText: string;
}
