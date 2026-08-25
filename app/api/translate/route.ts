import { NextResponse } from "next/server";
import {
  translateText,
  MissingAnthropicKeyError,
  TranslationFailedError,
} from "@/lib/translation/translate";
import { getLanguage } from "@/types";

/**
 * Translates one utterance. The Anthropic API key stays server-side —
 * see lib/translation/translate.ts.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { text, from, to } = (body ?? {}) as {
    text?: unknown;
    from?: unknown;
    to?: unknown;
  };

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "`text` must be a non-empty string." }, { status: 400 });
  }

  const fromLanguage = typeof from === "string" ? getLanguage(from) : undefined;
  const toLanguage = typeof to === "string" ? getLanguage(to) : undefined;

  if (!fromLanguage || !toLanguage) {
    return NextResponse.json(
      { error: "`from` and `to` must be supported language codes." },
      { status: 400 },
    );
  }

  if (fromLanguage.code === toLanguage.code) {
    return NextResponse.json({ translatedText: text });
  }

  try {
    const result = await translateText({
      text,
      from: fromLanguage.code,
      to: toLanguage.code,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MissingAnthropicKeyError) {
      console.error("[api/translate]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error instanceof TranslationFailedError) {
      console.error("[api/translate]", error.message);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[api/translate] unexpected error", error);
    return NextResponse.json({ error: "Could not translate that." }, { status: 500 });
  }
}
