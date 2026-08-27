import type { CallLanguageCode, Profile } from "@/types";

/** The columns every profile read needs. Keeps the four call sites in step. */
export const PROFILE_COLUMNS =
  "id, username, display_name, preferred_language, last_seen_at, avatar_url, phone, room_slug, is_guest";

/** Row shape returned by a PROFILE_COLUMNS select. */
export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  preferred_language: string;
  last_seen_at: string;
  avatar_url: string | null;
  phone: string | null;
  room_slug: string;
  is_guest: boolean;
}

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    preferredLanguage: row.preferred_language as CallLanguageCode,
    lastSeenAt: row.last_seen_at,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    roomSlug: row.room_slug,
    isGuest: row.is_guest,
  };
}
