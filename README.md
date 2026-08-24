# OHUN

**Speak freely. Understand instantly.**

OHUN is a real-time voice language bridge. Two people who speak different
languages have a natural spoken conversation: each person talks normally in
their own language, OHUN captures the speech, transcribes it, translates the
meaning (not just the words) into the other person's language, and speaks
the translation aloud — so the conversation stays a conversation, not a
typing exercise.

Initial supported languages: **English, French, Spanish, Yoruba**.

## Current implementation status — Phase 2

**Phase 1** built the frontend foundation: Next.js App Router + TypeScript +
Tailwind CSS, the three routes (`/`, `/setup`, `/conversation`), and a
reusable component library.

**Phase 2 (this commit) makes Person A's microphone real:**

- Clicking Person A's mic button requests microphone permission, opens a
  realtime session with AssemblyAI, and streams captured audio to it.
- Live transcript text from AssemblyAI renders in Person A's "Live
  transcript" panel as they speak.
- The mic button and connection badge reflect real state: connecting,
  listening, error, disconnected.
- The AssemblyAI API key never reaches the browser. The client fetches a
  short-lived token from `POST /api/assemblyai/token`, which mints it
  server-side (`lib/assemblyai/token.ts`, guarded by the `server-only`
  package) using `ASSEMBLYAI_API_KEY`.
- Errors are handled and shown in the UI, not swallowed: microphone
  permission denied, no/unavailable microphone, missing/invalid API key,
  WebSocket connection failure, a connection dropping mid-session, and the
  browser not supporting the required Web Audio APIs.

**What is intentionally NOT implemented yet:**

- No translation. No text-to-speech / audio playback.
- Person B's microphone is still an inert placeholder — only Person A is
  wired up in this phase.
- Person A's chosen language (from `/setup`) is not yet passed to
  AssemblyAI to steer the speech model — transcription currently runs with
  AssemblyAI's default streaming configuration. Accuracy for non-English
  speech may vary until that's wired up.

`lib/translation` and `lib/audio/player.ts` still throw `NotImplementedError`
rather than returning fake/mocked data — nothing in the app claims
translation or speech playback works.

## Planned architecture

```
Browser (Next.js client)
  mic capture (lib/audio/recorder)              — implemented (Phase 2)
        │  PCM16 audio chunks
        ▼
  AssemblyAI realtime streaming STT (lib/assemblyai)   — implemented (Phase 2)
        │  transcript (turn-by-turn)
        ▼
  Translation service (lib/translation) — context-aware, not word-for-word
        │  translated text                       — not implemented yet
        ▼
  Text-to-speech playback (lib/audio/player)
        │  synthesized audio                      — not implemented yet
        ▼
  Other participant hears the translation
```

The browser never talks to AssemblyAI's REST API directly — only to the
realtime WebSocket, authenticated with a token minted server-side:

```
Browser                          Next.js server                 AssemblyAI
  │  POST /api/assemblyai/token       │                               │
  │ ─────────────────────────────────>│                               │
  │                                   │  createTemporaryToken()       │
  │                                   │ ─────────────────────────────>│
  │                                   │ <───────────────────────────  │
  │ <───────────────────────────────  │         { token }             │
  │  { token }                        │                               │
  │                                                                    │
  │  wss://streaming.assemblyai.com/v3/ws?token=...                   │
  │ ──────────────────────────────────────────────────────────────── >│
  │  PCM16 audio chunks ────────────────────────────────────────────> │
  │ <──────────────────────────────────────────────── Turn events ─── │
```

Planned phases:

- **Phase 1 (done):** frontend foundation — routes, components, types,
  integration boundaries, no live functionality.
- **Phase 2 (done):** real microphone capture and real-time transcription
  for Person A via AssemblyAI's streaming API.
- **Phase 3:** context-aware translation and text-to-speech playback,
  completing the end-to-end conversation loop; wire up Person B's mic and
  per-language streaming configuration.

## Environment variables

| Variable | Required for | Purpose |
| --- | --- | --- |
| `ASSEMBLYAI_API_KEY` | Phase 2 (now) | Server-side only. Used to mint short-lived streaming tokens. Never exposed to the browser — do **not** prefix it with `NEXT_PUBLIC_`. |
| `TRANSLATION_API_KEY` | Phase 3 | Context-aware translation provider. |
| `TTS_API_KEY` | Phase 3 | Text-to-speech playback of translated speech. |

Copy `.env.example` to `.env.local` and fill in `ASSEMBLYAI_API_KEY` with a
real AssemblyAI API key (from your AssemblyAI account dashboard) to enable
live transcription locally. Without it, Person A's mic button will show a
clear "not configured" error rather than silently failing.

## Development

```bash
npm install
cp .env.example .env.local   # then fill in ASSEMBLYAI_API_KEY
npm run dev       # start the dev server
npm run lint       # eslint
npm run build      # production build
```

## Project structure

```
app/
  page.tsx                        landing page
  setup/page.tsx                   language selection
  conversation/page.tsx             conversation UI shell
  api/assemblyai/token/route.ts     mints a short-lived AssemblyAI streaming token (server-only)
components/
  ui/                              generic building blocks (Button, Pill, Card, LanguageSelect)
  ohun/                            product components (Logo, HandsBridge, PersonPanel, MicButton, ...)
lib/
  assemblyai/
    token.ts                        server-only: mints streaming tokens with ASSEMBLYAI_API_KEY
    client.ts                       browser-only: opens the AssemblyAI realtime session
    useTranscriptionSession.ts       React hook wiring mic capture + transcription into UI state
    types.ts, errors.ts             shared types and error classes
  translation/                      translation integration boundary (not implemented)
  audio/
    recorder.ts                     browser-only: mic capture, resampling, PCM16 packing (provider-agnostic)
    player.ts                       text-to-speech playback boundary (not implemented)
types/                              shared domain types (Language, MicState, ConnectionState, ...)
public/worklets/mic-pcm-worklet.js  AudioWorklet processor used by lib/audio/recorder.ts
```
