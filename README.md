# OHUN

**Feels like a call. Works like a translator.**

OHUN is a real-time voice translation app. Two people who speak different
languages have a natural conversation — by chat, by voice call, or by video
call — each speaking or typing in their own language, with OHUN
transcribing, translating the *meaning*, and delivering it in the other
person's language as it happens. No typing exercise, no waiting for a human
interpreter, no app to install on most platforms.

Built for the AssemblyAI hackathon on Next.js 16, Supabase, AssemblyAI
Universal-Streaming, and Claude.

## What it does

**Translated chat.** Message anyone with an OHUN account. Every message and
voice note is translated into the recipient's own preferred language, in
both directions, automatically — you never pick a language for a
conversation, each person's profile setting handles it.

**Voice and video calls, 1:1.** Real-time speech translation over a live
call: you speak, OHUN transcribes and translates your side, and the
translation is both captioned and spoken aloud on the other person's
device — while their raw voice is briefly ducked so the translation stays
intelligible. Add a camera or share your screen mid-call without hanging up;
captions and translation keep running underneath either.

**Group calls.** Up to 7 people, any mix of the 6 supported languages, one
room. Everyone's speech is translated into every other language present and
captioned for each participant in their own. Cameras work the same way as
1:1 — each participant can turn theirs on independently.

**Room links.** Every account gets a personal, shareable call link
(`/r/username`). Anyone who opens it can start a translated call with you —
including someone with no OHUN account at all, via a lightweight guest
identity.

**Scheduling.** Book a call for later with someone; they get an email
invite (via Resend) with the details.

**Call summaries.** After a call ends, Claude writes a short recap of what
was actually discussed — one version per language present, so nobody reads
a summary of their own call in someone else's language.

**Push notifications.** Installed as a home-screen app (a real PWA, working
on iOS Safari too), OHUN can push a notification for new messages even when
the tab isn't open.

## Supported languages

**English, French, Spanish, German, Portuguese, Italian** — on accounts,
calls, and chat. These are the languages AssemblyAI's Universal-Streaming
models transcribe.

Yoruba is defined in the language list and available in the single-device
`/conversation` demo, but not offered on real accounts or calls: offering it
there would silently fail to transcribe, since no current AssemblyAI
streaming model covers it. Supporting it for real means a Whisper-streaming
model or another STT provider, with a different latency profile.

## How it works

**The translation loop**, the same shape everywhere it appears (chat, 1:1
calls, group calls):

```
Your microphone / typed message
        │
        ▼
AssemblyAI Universal-Streaming — realtime transcription, turn by turn
        │  finished utterance
        ▼
Claude — translates meaning (not word-for-word), preserving tone,
         recovering from speech-recognition slips
        │  translated text
        ▼
Captioned for both sides · spoken aloud with the Web Speech API on a call
```

Secrets never reach the browser. The client gets a short-lived AssemblyAI
token from the server and streams audio directly to AssemblyAI; translation
always goes browser → our server → Claude → browser, so `ANTHROPIC_API_KEY`
and `ASSEMBLYAI_API_KEY` never leave the server.

**Calls (1:1 and group) are peer-to-peer WebRTC.** Supabase Realtime carries
only the signalling (SDP offers/answers and ICE candidates) and presence;
audio and video never pass through our servers. STUN plus a TURN relay
(Metered) covers networks where a direct connection can't form. A group call
is a full mesh — everyone holds one connection to everyone else, audio and
any cameras they've turned on riding those same connections.

**Video is additive, not a separate mode.** Screen share (1:1 only — no
browser ships `getDisplayMedia` on iOS) and camera video (1:1 and group,
works everywhere `getUserMedia` does, iOS Safari included) both just add a
track to the existing call. Captions and translation never stop for either.

**Chat and calls share nothing but the account system.** A chat thread's
translations are stored per message per language, computed once and cached;
a call's translation is live and ephemeral, spoken and captioned but never
recorded except in the post-call summary.

## Tech stack

- **Next.js 16** (App Router, Server Actions, Turbopack) + **React 19**
- **Supabase** — Postgres with Row Level Security, Auth, Realtime
  (broadcast + `postgres_changes`), Storage
- **AssemblyAI** — Universal-Streaming realtime speech-to-text
- **Anthropic Claude** — translation and call summaries
- **WebRTC** — `RTCPeerConnection` directly (no external calling SDK), STUN
  + Metered TURN
- **Web Push** — VAPID, service worker, Web App Manifest for installable
  push on iOS
- **Tailwind CSS 4**

## Project structure

```
app/
  page.tsx                    landing page
  (auth)/login, signup         Supabase email/password auth
  setup/                       first-run: display name, username, language
  people/                      search, recent calls, start a call or group call
  chat/[threadId]/             one translated chat thread
  chats/                       thread list
  call/[callId]/               a 1:1 voice/video call
  room/[roomId]/               a group call
  r/[slug]/                    a personal room link — join or start a call
  conversation/                single-device demo: two languages, one mic at a time
  api/
    assemblyai/token/           mints a short-lived AssemblyAI streaming token
    translate/, translate-many/  translate one or many utterances via Claude
    ice-servers/                 resolves STUN/TURN config server-side
    rooms/[roomId]/              group-call roster endpoint

components/
  ui/                         generic building blocks (Button, Pill, Card, ...)
  ohun/                       product components — CallRoom, RoomCall, ChatRoom,
                               LiveCaptions, PushNotificationToggle, ...

lib/
  assemblyai/                 token minting (server), realtime session + hook (browser)
  translation/                 Claude translation calls (server + client)
  audio/                       mic capture (AudioWorklet), Web Speech playback, queueing
  webrtc/
    peer.ts                     one 1:1 RTCPeerConnection — mic, screen share, camera
    mesh.ts                     full-mesh N-way RTCPeerConnections for group calls
    client.ts, ice.ts           ICE config fetch
  calls/, rooms/               call/room session hooks, Supabase-backed signalling
  chat/                        thread + message actions, translation, transcription
  push/                        Web Push subscribe/send
  schedule/, email/             scheduled calls + Resend invites
  summary/                     post-call Claude recap
  supabase/                    client/server/admin Supabase clients

supabase/schema.sql            full Postgres schema + RLS policies
public/sw.js                   service worker (push notifications)
public/worklets/                AudioWorklet used by lib/audio/recorder.ts
types/                          shared domain types
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. Publishable — RLS protects the data. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key. Publishable. Never use the service-role key here. |
| `ASSEMBLYAI_API_KEY` | yes | Server-only. Mints short-lived streaming tokens for speech-to-text. |
| `ANTHROPIC_API_KEY` | yes | Server-only. Used to translate utterances and write call summaries. |
| `SUPABASE_SERVICE_ROLE_KEY` | recommended | Server-only, bypasses RLS. Needed for scheduled-call email lookups and delivering push notifications to a *different* user than the caller. |
| `METERED_APP_NAME` / `METERED_API_KEY` | recommended | Server-only. Preferred TURN path — per-session, geo-nearest credentials. Without a working TURN relay, calls fail on restrictive networks. |
| `METERED_TURN_USERNAME` / `METERED_TURN_CREDENTIAL` | optional | Server-only. Static TURN fallback, used only if the pair above is unset. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | optional | A Web Push VAPID keypair (`npx web-push generate-vapid-keys`). Leave unset to disable push notifications — the in-app watcher still works for an open tab. |
| `VAPID_SUBJECT` | optional | A `mailto:` or `https:` contact URI, used if a push service needs to reach you about a misbehaving subscription. |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional | Enables scheduled-call email invites. Leave unset to disable — scheduling still works, it just sends nothing. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Public origin (e.g. `https://ohun-nu.vercel.app`, no trailing slash) used in outbound email links and the signup confirmation redirect. |
| `NEXT_PUBLIC_ASSEMBLYAI_PRO` | optional | Set `true` only on an AssemblyAI account known to have Universal-3.5 Pro access (spoken-language detection, mid-sentence code-switching). Wrong on the wrong account: the session connects but silently never transcribes. |

None of the non-`NEXT_PUBLIC_` variables may ever be prefixed with
`NEXT_PUBLIC_` — that exposes them to the browser. Copy `.env.example` to
`.env.local` and fill in at least Supabase, AssemblyAI, and Anthropic to run
the app; the rest degrade gracefully when unset (see the table above and the
comments in `.env.example`).

## Setup

1. Create a Supabase project, then run `supabase/schema.sql` in the SQL
   editor (Dashboard → SQL Editor) — it creates every table, RLS policy, and
   the Realtime publications the app needs.
2. Copy `.env.example` to `.env.local` and fill in Supabase, AssemblyAI, and
   Anthropic at minimum.
3. `npm install`
4. `npm run dev`

```bash
npm install
cp .env.example .env.local   # then fill in the keys you need
npm run dev        # start the dev server
npm run lint       # eslint
npm run build      # production build
```

Without TURN configured, calls still work on networks that allow a direct
peer connection and fall back to a visible "no relay" warning where they
don't. Without push configured, everything else works; new-message alerts
just don't reach a closed tab.

## Known limitations

- **Yoruba is chat/demo-only** — see "Supported languages" above.
- **Screen share needs `getDisplayMedia`**, which no iOS browser (Safari
  included) has ever shipped. Camera video has no such gap.
- **Group calls are capped at 7 participants.** Mesh cost grows with the
  square of the room size — fine for audio, and for a few simultaneous
  cameras, but not designed to scale past that without moving to a
  selective forwarding unit.
- **Translation runs on completed utterances**, so there is a short pause
  between finishing a sentence and hearing the translation — the tradeoff
  favours translation quality (full-sentence context) over shaving that
  latency further.
- **Spoken voice quality depends on the device**, since playback uses the
  browser's own Web Speech API and whatever voices the OS has installed. If
  a language has no installed voice, the browser falls back to its default
  and the translation still appears as text either way.
