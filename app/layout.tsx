import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { IncomingCallWatcher } from "@/components/ohun/IncomingCallWatcher";
import { MessageWatcher } from "@/components/ohun/MessageWatcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OHUN — Speak freely. Understand instantly.",
  description:
    "OHUN is a real-time voice language bridge. Speak naturally in your own language and be understood instantly in theirs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
