"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { isCallLanguage, type LanguageCode } from "@/types";

/** What the public room page needs to render. Deliberately minimal — this is unauthenticated. */
export interface RoomOwner {
  id: string;
  username: string;
  displayName: string;
  preferredLanguage: LanguageCode;
  /**
   * False for a Yoruba-preferring owner: a room link exists purely to
   * place a call, and a call can never translate for them (no realtime
   * speech-to-text model covers it — see CallLanguageCode). The page
   * still resolves and shows who they are; it just cannot offer a call.
   */
  canCall: boolean;
  avatarUrl: string | null;
  /** So the visitor knows whether anyone is likely to pick up. */
  lastSeenAt: string;
}

/**
 * Resolves a room slug to its owner.
 *
 * Returns only public-profile fields: this runs for anyone holding the
 * link, signed in or not, so it must not expose anything the username
 * search would not already reveal.
 */
export async function getRoomOwner(slug: string): Promise<RoomOwner | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, preferred_language, avatar_url, last_seen_at, is_guest")
    .eq("room_slug", slug)
    .maybeSingle();

  // A guest's own room link is meaningless — they are a throwaway identity.
  if (!data || data.is_guest) return null;

  const preferredLanguage = data.preferred_language as LanguageCode;

  return {
    id: data.id as string,
    username: data.username as string,
    displayName: data.display_name as string,
    preferredLanguage,
    canCall: isCallLanguage(preferredLanguage),
    avatarUrl: (data.avatar_url as string | null) ?? null,
    lastSeenAt: data.last_seen_at as string,
  };
}

/** Rotates the signed-in user's room link, invalidating the old one. */
export async function regenerateRoomLink(): Promise<{ slug?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // room_slug is revoked from the `authenticated` role precisely so a
  // client cannot set it to a value of its choosing — the new slug has to
  // come from the database function, through the service-role client.
  const admin = tryCreateAdminClient();
  if (!admin) {
    return { error: "Link rotation isn't available on this deployment yet." };
  }

  const { data: generated, error: generateError } = await admin.rpc("generate_room_slug");
  if (generateError || typeof generated !== "string") {
    return { error: "Could not generate a new link." };
  }

  const { error } = await admin
    .from("profiles")
    .update({ room_slug: generated })
    .eq("id", user.id);

  if (error) return { error: "Could not update your link." };

  revalidatePath("/profile");
  return { slug: generated };
}
