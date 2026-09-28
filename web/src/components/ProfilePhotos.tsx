"use client";

import Image from "next/image";
import { useActionState, useState, useTransition } from "react";
import { type FormState, deletePhoto, makeMainPhoto, uploadPhoto } from "@/app/actions";
import { shrinkForUpload } from "@/lib/shrink";
import type { PhotoRef } from "@/lib/types";
import { photoUrl } from "./Avatar";

const MAX_PHOTOS = 4;

export function ProfilePhotos({ photos }: { photos: PhotoRef[] }) {
  const [state, action, uploading] = useActionState<FormState, FormData>(uploadPhoto, {});
  const [changing, startChanging] = useTransition();
  const [preparing, setPreparing] = useState(false);
  const busy = uploading || preparing;

  async function pick(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setPreparing(true);
    const small = await shrinkForUpload(file);
    if (small !== file) {
      const transfer = new DataTransfer();
      transfer.items.add(small);
      input.files = transfer.files;
    }
    setPreparing(false);
    input.form?.requestSubmit();
  }

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
            {index === 0 ? (
              <span className="absolute top-2 left-2 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-white dark:text-background">
                Main
              </span>
            ) : (
              <button
                type="button"
                disabled={changing}
                onClick={() => startChanging(() => makeMainPhoto(photo.id))}
                className="absolute top-2 left-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                aria-label={`Make photo ${index + 1} your main photo`}
              >
                Make main
              </button>
            )}
            <button
              type="button"
              disabled={changing}
              onClick={() => startChanging(() => deletePhoto(photo.id))}
              className="absolute right-2 bottom-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
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
              busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {preparing ? "Preparing..." : uploading ? "Uploading..." : "Add photo"}
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="sr-only"
              onChange={(event) => void pick(event.currentTarget)}
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
