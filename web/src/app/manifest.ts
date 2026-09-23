import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Matchium",
    short_name: "Matchium",
    description: "A few questions a day, a few matches a day, and a straight answer about why.",
    start_url: "/today",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#1f9d63",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
