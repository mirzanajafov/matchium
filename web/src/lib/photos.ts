export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const UPLOAD_TOO_BIG = "That photo is over 8 MB.";

export function photoUrl(id: string): string {
  return `/api/photos/${id}`;
}
