"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  isCallLanguage,
  validateDisplayName,
  validatePhone,
} from "@/types";

export interface ProfileFormState {
  error: string | null;
  info?: string | null;
}

/** Updates the parts of a profile the owner is allowed to change. */
export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  const nameError = validateDisplayName(displayName);
  if (nameError) return { error: nameError };

  if (!isCallLanguage(preferredLanguage)) {
    return { error: "Choose a supported language." };
  }

  // Spaces, dashes and brackets are how people actually type numbers;
  // normalise before validating rather than rejecting a valid number.
  const phone = phoneRaw ? phoneRaw.replace(/[\s()-]/g, "") : "";
  const phoneError = validatePhone(phone);
  if (phoneError) return { error: phoneError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      preferred_language: preferredLanguage,
      phone: phone || null,
    })
    .eq("id", user.id);

  if (error) return { error: "Could not save your profile." };

  revalidatePath("/profile");
  revalidatePath("/people");
  return { error: null, info: "Profile saved." };
}

/** Uploads a new avatar and points the profile at it. */
export async function updateAvatar(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image first." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { error: "That image is larger than 2MB." };
  }
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    return { error: "Use a JPEG, PNG or WebP image." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  // The path must start with the user's id — that is what the storage
  // policy checks. The timestamp busts the CDN cache on re-upload.
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) return { error: "Could not upload that image." };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (error) return { error: "Uploaded the image but could not save it to your profile." };

  revalidatePath("/profile");
  revalidatePath("/people");
  return { error: null, info: "Photo updated." };
}

/** Clears the avatar, falling back to the initials placeholder. */
export async function removeAvatar(): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);

  if (error) return { error: "Could not remove your photo." };

  revalidatePath("/profile");
  revalidatePath("/people");
  return { error: null, info: "Photo removed." };
}
