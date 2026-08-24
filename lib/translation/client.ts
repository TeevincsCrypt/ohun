import { NotImplementedError } from "@/lib/errors";
import type { TranslationRequest, TranslationResult } from "./types";

/**
 * Will translate meaning/context (not just words) from one supported
 * language to another using an LLM-backed translation call.
 *
 * Not implemented yet: no request is made. Defines the integration
 * boundary for Phase 2/3.
 */
export async function translateText(
  _request: TranslationRequest,
): Promise<TranslationResult> {
  throw new NotImplementedError("Context-aware translation", "Phase 2");
}
