import type { Metadata } from "next";
import { Figtree, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { IncomingCallWatcher } from "@/components/ohun/IncomingCallWatcher";
import { MessageWatcher } from "@/components/ohun/MessageWatcher";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// Used only for the "what was actually said" line in a translated pair
// (see .text-original in globals.css) — everywhere else in the app is
// Figtree or IBM Plex Mono.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  style: ["italic", "normal"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OHUN — Speak freely. Understand instantly.",
  description:
    "OHUN is a real-time voice language bridge. Speak naturally in your own language and be understood instantly in theirs.",
  // Paired with app/manifest.ts. `capable: true` is Apple's own, older
  // signal for "run this as an installed app, not a Safari tab" — some
  // iOS versions still key off it alongside the manifest's `display`
  // field, so both are set rather than relying on either alone.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OHUN",
  },
  // `appleWebApp.capable` above renders only the modern, unprefixed
  // "mobile-web-app-capable" tag — iOS versions in the 16.4–17.x range are
  // documented to key specifically off the older Apple-prefixed name
  // instead, so it is added directly here. `other` is the supported escape
  // hatch for a tag the Metadata API has no typed field for; a `<meta>`
  // hand-written into this file's own <head> JSX does not reliably survive
  // Next's metadata resolution and was empirically dropped from the
  // rendered page when tried.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${plexMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        {/*
          Applies the saved theme before the first paint. Anything that runs
          after hydration is a frame too late: the page would render dark,
          then flash to light, on every load for anyone who chose light.
          Deliberately tiny and dependency-free for that reason — it blocks
          rendering while it runs. Dark needs no attribute; it is what the
          stylesheet already defines.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("ohun-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {children}
        {/* App-wide so a signed-in user is reachable anywhere, not just /people. */}
        <IncomingCallWatcher />
        {/* Same reason: a message should find you wherever you are. */}
        <MessageWatcher />
      </body>
    </html>
  );
}
