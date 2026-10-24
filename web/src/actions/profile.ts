"use server";

import { revalidatePath } from "next/cache";
import { api, authedApi } from "@/lib/api";
import type { ActionResult, FormState } from "@/lib/types";
import { attempt } from "./attempt";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function saveBio(_: FormState, formData: FormData): Promise<FormState> {
  const bio = String(formData.get("bio") ?? "");
  const saved = await attempt(
    () => authedApi("/me/profile", { method: "PATCH", body: { bio } }),
    "Couldn't save your bio. Try again in a moment.",
    { 400: "Keep it under 300 characters." },
  );
  if (!saved.ok) return { error: saved.error, values: { bio } };
  revalidatePath("/me");
  return { done: true, values: { bio } };
}

export async function uploadPhoto(_: FormState, formData: FormData): Promise<FormState> {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { error: "Pick a photo first." };
  if (photo.size > MAX_UPLOAD_BYTES) return { error: "That photo is over 8 MB." };
  const form = new FormData();
  form.set("photo", photo);
  const uploaded = await attempt(
    () => authedApi("/me/photos", { body: form }),
    "Couldn't upload that photo. Try again in a moment.",
  );
  if (!uploaded.ok) return { error: uploaded.error };
  revalidatePath("/me");
  return { done: true };
}

async function changeProfile(change: () => Promise<unknown>, fallback: string): Promise<ActionResult> {
  const changed = await attempt(async () => {
    await change();
  }, fallback);
  if (changed.ok) revalidatePath("/me");
  return changed;
}

export async function deletePhoto(photoId: string): Promise<ActionResult> {
  return changeProfile(
    () => authedApi(`/me/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" }),
    "Couldn't delete that photo. Try again in a moment.",
  );
}

export async function makeMainPhoto(photoId: string): Promise<ActionResult> {
  return changeProfile(
    () => authedApi(`/me/photos/${encodeURIComponent(photoId)}/main`, { method: "POST" }),
    "Couldn't move that photo. Try again in a moment.",
  );
}

export async function setEmailDigest(enabled: boolean): Promise<ActionResult> {
  return changeProfile(
    () => authedApi("/me/preferences", { method: "PATCH", body: { emailDigest: enabled } }),
    "Couldn't save that. Try again.",
  );
}

export async function unsubscribeEmail(token: string): Promise<ActionResult> {
  return attempt(
    async () => {
      await api(`/email/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
    },
    "That didn't work. Try again in a moment.",
    { 410: "This link doesn't work anymore." },
  );
}
