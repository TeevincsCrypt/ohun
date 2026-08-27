import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { IncomingCallWatcher } from "@/components/ohun/IncomingCallWatcher";

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
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {children}
        {/* App-wide so a signed-in user is reachable anywhere, not just /people. */}
        <IncomingCallWatcher />
      </body>
    </html>
  );
}
