import Image from "next/image";
import type { PhotoRef } from "@/lib/types";
import { photoUrl } from "./Avatar";

export function PhotoStrip({ name, photos }: { name: string; photos: PhotoRef[] }) {
  if (photos.length === 0) return null;
  return (
    <ul
      aria-label={`Photos of ${name}`}
      className="-mx-6 -mt-6 mb-5 flex snap-x snap-mandatory gap-1 overflow-x-auto rounded-t-2xl"
    >
      {photos.map((photo, index) => (
        <li key={photo.id} className="w-full shrink-0 snap-center">
          <Image
            src={photoUrl(photo.id)}
            alt={`${name}, photo ${index + 1} of ${photos.length}`}
            width={photo.width}
            height={photo.height}
            unoptimized
            className="aspect-[4/5] w-full object-cover"
          />
        </li>
      ))}
    </ul>
  );
}
