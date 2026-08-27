import { NextResponse } from "next/server";
import { translateToMany } from "@/lib/translation/translate-many";
import { MissingAnthropicKeyError, TranslationFailedError } from "@/lib/translation/translate";
import { createClient } from "@/lib/supabase/server";
import { isCallLanguage, MAX_ROOM_PARTICIPANTS, type CallLanguageCode } from "@/types";

/**
 * Translates one utterance into every language a group call needs.
 *
 * Requires a session: this spends Anthropic tokens per request, and an
 * unauthenticated caller could otherwise run up the bill freely.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { text, from, to } = (body ?? {}) as { text?: unknown; from?: unknown; to?: unknown };

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "`text` must be a non-empty string." }, { status: 400 });
  }
  if (!isCallLanguage(from)) {
    return NextResponse.json({ error: "`from` must be a call language." }, { status: 400 });
  }
  if (!Array.isArray(to) || to.length === 0 || !to.every(isCallLanguage)) {
    return NextResponse.json(
      { error: "`to` must be a non-empty array of call languages." },
      { status: 400 },
    );
  }
  // A room can hold at most MAX_ROOM_PARTICIPANTS people, so it can never
  // need more distinct target languages than that minus the speaker.
  if (to.length > MAX_ROOM_PARTICIPANTS - 1) {
    return NextResponse.json({ error: "Too many target languages." }, { status: 400 });
  }

  try {
    const result = await translateToMany({
      text,
      from,
      to: to as CallLanguageCode[],
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MissingAnthropicKeyError) {
      console.error("[api/translate-many]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error instanceof TranslationFailedError) {
      console.error("[api/translate-many]", error.message);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[api/translate-many] unexpected error", error);
    return NextResponse.json({ error: "Could not translate that." }, { status: 500 });
  }
}
