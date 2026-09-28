import Image from "next/image";

export function photoUrl(id: string): string {
  return `/api/photos/${id}`;
}

export function Avatar({ name, photo, size = 40 }: { name: string; photo: string | null; size?: number }) {
  if (photo) {
    return (
      <Image
        src={photoUrl(photo)}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
