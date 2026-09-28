"use client";

import Image from "next/image";
import { useActionState, useTransition } from "react";
import { type FormState, deletePhoto, uploadPhoto } from "@/app/actions";
import type { PhotoRef } from "@/lib/types";
import { photoUrl } from "./Avatar";

const MAX_PHOTOS = 4;

export function ProfilePhotos({ photos }: { photos: PhotoRef[] }) {
  const [state, action, uploading] = useActionState<FormState, FormData>(uploadPhoto, {});
  const [removing, startRemoving] = useTransition();

  return (
    <div>
      <h2 className="text-sm font-medium">Photos</h2>
      <p className="mt-1 text-sm text-muted">
        Only people you&apos;re matched with can see them. We strip location and camera data from every upload.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {photos.map((photo, index) => (
          <li key={photo.id} className="relative">
            <Image
              src={photoUrl(photo.id)}
              alt={`Your photo ${index + 1}`}
              width={photo.width}
              height={photo.height}
              unoptimized
              className="aspect-[4/5] w-full rounded-xl object-cover"
            />
            <button
              type="button"
              disabled={removing}
              onClick={() => startRemoving(() => deletePhoto(photo.id))}
              className="absolute top-2 right-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              aria-label={`Remove photo ${index + 1}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {photos.length < MAX_PHOTOS && (
        <form action={action} className="mt-4">
          <label
            className={`inline-flex h-10 cursor-pointer items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background focus-within:ring-2 focus-within:ring-accent ${
              uploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {uploading ? "Uploading..." : "Add photo"}
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            />
          </label>
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-warn">
          {state.error}
        </p>
      )}
    </div>
  );
}
