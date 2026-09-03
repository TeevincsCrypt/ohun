import type { MetadataRoute } from "next";

/**
 * Web App Manifest. Auto-served by Next.js at /manifest.webmanifest, with
 * the <link rel="manifest"> tag injected automatically — no manual wiring
 * in layout.tsx needed.
 *
 * This is not decoration. iOS Safari only delivers Web Push to a page
 * running in standalone display mode, and "standalone" is a status Apple
 * grants specifically to a home-screen install of a page that declares a
 * manifest with `display: "standalone"` — a page added to the home screen
 * without one just opens as an ordinary Safari tab, which cannot receive
 * push at all. Without this file, "Add to Home Screen" looked like it
 * worked (an icon appears, notifications toggle "on") while push
 * notifications were structurally unable to ever arrive.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OHUN",
    short_name: "OHUN",
    description: "Speak freely. Understand instantly.",
    start_url: "/chats",
    display: "standalone",
    background_color: "#08090b",
    theme_color: "#08090b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
