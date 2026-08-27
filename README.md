# OHUN

**Speak freely. Understand instantly.**

OHUN is a real-time voice language bridge. Two people who speak different
languages have a natural spoken conversation: each person talks normally in
their own language, OHUN captures the speech, transcribes it, translates the
meaning (not just the words) into the other person's language, and speaks
the translation aloud — so the conversation stays a conversation, not a
typing exercise.

Supported languages: **English, French, Spanish**. (Yoruba is defined in the
language list but deferred — see "Known limitations".)

## Current implementation status — Phase 3

The full conversation loop is implemented: **speak → transcribe → translate →
hear it in the other language**, in both directions.

**Phase 1** built the frontend foundation. **Phase 2** made Person A's
microphone real. **Phase 3 (this commit) closes the loop:**

- **Both microphones work.** Person A and Person B each capture speech,
  transcribe it, and translate into the other's language. Only one mic runs
  at a time — starting one stops the other, so neither side transcribes the
  other's spoken translation back into the conversation.
- **Context-aware translation.** Completed utterances go to Claude
  (`claude-opus-5`) via `POST /api/translate`, prompted to translate meaning
  and intent rather than word-for-word, to preserve the speaker's tone and
  register, and to recover from speech-recognition errors. Only finished
  utterances are translated — partials would spam the API and translate
  half-finished sentences.
- **Spoken playback.** Translations are spoken aloud with the browser's Web
  Speech API (`SpeechSynthesis`) — no extra API key, no cost, no added
  dependency. The "Repeat translation" button replays the last one.
- **Per-language speech models.** Each participant's language from `/setup`
  now selects the AssemblyAI streaming model: `universal-streaming-english`
  for English, `universal-streaming-multilingual` for French and Spanish.
  This was the Phase 2 gap where non-English speech ran on an English-tuned
  model.
- **Keys stay server-side.** Neither `ASSEMBLYAI_API_KEY` nor
  `ANTHROPIC_API_KEY` reaches the browser. Both are read only in modules that
  import the `server-only` package, so an accidental client import is a build
  error. Verified against the production bundle: neither name appears
  anywhere in `.next/static`.

### Known limitations

- **Yoruba is deferred.** It remains in `types/language.ts` and the `/setup`
  selector, but AssemblyAI's Universal-Streaming models cover English,
  Spanish, German, French, Portuguese and Italian — not Yoruba. Selecting it
  will not transcribe correctly. Supporting it means moving to AssemblyAI's
  Whisper-streaming model (99+ languages, different latency profile) or
  another provider.
- **Translation latency is not yet tuned.** Translation runs on completed
  utterances, so there is a pause between finishing a sentence and hearing
  it. `claude-opus-5` at `effort: "low"` is the current tradeoff, favouring
  translation quality; `claude-haiku-4-5` would be faster and cheaper if
  latency matters more than nuance.
- **Voice quality depends on the device.** Web Speech uses whatever voices
  the operating system has installed. If no voice exists for a language, the
  browser falls back to its default rather than failing — the translation
  still appears as text.

## Phase 4a — accounts and voice calling

Ohun is becoming a real product: accounts, usernames, and browser-to-browser
audio calls. Phase 4a delivers the calling foundation. **Translation is not
yet wired into the call room** — that is Phase 4b. The single-device demo at
`/conversation` is unchanged and still does the full translate-and-speak loop.

- **Auth** — Supabase email/password. Passwords live in Supabase `auth.users`;
  `profiles` holds only public account data.
- **Profiles** — display name, unique `@username`, preferred language, and an
  online indicator driven by a `last_seen_at` heartbeat.
- **Search** — find people by username or display name.
- **Calling** — place a call, receive an incoming-call prompt, accept or
  decline, then talk over WebRTC. Mute, audio toggle, call duration, end call.
- **Signalling** — Supabase Realtime. Postgres changes on the `calls` row
  drive ring/accept/end; a broadcast channel carries SDP and ICE. Audio itself
  is peer-to-peer and never passes through our servers.
- **Relay** — STUN plus Metered TURN, resolved server-side via
  `/api/ice-servers` so the provider key never reaches the browser.

### Call languages are narrower than the demo

Accounts may choose **English, French or Spanish** only. Calls run through
AssemblyAI streaming, whose models cover English, Spanish, German, French,
Portuguese and Italian — **not Yoruba**. Offering Yoruba here would create
calls that silently fail to transcribe, so it stays available only in the
`/conversation` demo. Supporting it means AssemblyAI's Whisper-streaming
model (different latency profile) or another provider.

### Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor (Dashboard → SQL Editor).
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. For TURN, set either `METERED_APP_NAME` + `METERED_API_KEY` (preferred) or
   `METERED_TURN_USERNAME` + `METERED_TURN_CREDENTIAL`.

Without Supabase configured the app still runs and Phases 1–3 work; only the
account and calling routes are unavailable.

## Architecture

```
Browser (Next.js client)
  mic capture (lib/audio/recorder)                     — implemented
        │  PCM16 audio chunks, 16kHz mono
        ▼
  AssemblyAI realtime streaming STT (lib/assemblyai)    — implemented
        │  transcript, turn by turn
        ▼
  Translation (lib/translation → /api/translate → Claude)  — implemented
        │  translated text
        ▼
  Speech playback (lib/audio/player, Web Speech API)    — implemented
        │  spoken audio
        ▼
  The other participant hears it in their language
```

Secrets never reach the browser. It talks to AssemblyAI's realtime WebSocket
with a short-lived token, and never calls Claude directly:

```
Browser                          Next.js server              AssemblyAI / Claude
  │  POST /api/assemblyai/token       │                               │
  │ ─────────────────────────────────>│  createTemporaryToken()       │
  │ <───────────────────────────────  │ <────────────────────────────>│
  │  { token }                        │                               │
  │                                                                    │
  │  wss://streaming.assemblyai.com/v3/ws?token=...                   │
  │  PCM16 audio chunks ────────────────────────────────────────────> │
  │ <──────────────────────────────────────────────── Turn events ─── │
  │                                                                    │
  │  POST /api/translate              │                               │
  │ ─────────────────────────────────>│  messages.create()            │
  │ <───────────────────────────────  │ <────────────────────────────>│
  │  { translatedText }               │                               │
```

Phases:

- **Phase 1 (done):** frontend foundation — routes, components, types.
- **Phase 2 (done):** real microphone capture and realtime transcription.
- **Phase 3 (done):** translation, spoken playback, both microphones,
  per-language speech models.
- **Phase 4a (done):** accounts, usernames, user search, and WebRTC voice
  calls between two signed-in users.
- **Phase 4b:** wire the translation pipeline into the call room, so each
  side hears the other translated.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Publishable — RLS protects the data. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Publishable. Never use the service-role key here. |
| `METERED_APP_NAME` / `METERED_API_KEY` | Server-side only. Preferred TURN path: per-session, geo-nearest credentials. |
| `METERED_TURN_USERNAME` / `METERED_TURN_CREDENTIAL` | Server-side only. Static TURN fallback. |
| `ASSEMBLYAI_API_KEY` | Server-side only. Mints short-lived streaming tokens for speech-to-text. |
| `ANTHROPIC_API_KEY` | Server-side only. Used by `/api/translate` to translate utterances with Claude. |

Neither may be prefixed with `NEXT_PUBLIC_` — that would expose it to the
browser. Copy `.env.example` to `.env.local` and fill both in. Without them
the app shows a clear "not configured" error rather than failing silently.

## Development

```bash
npm install
cp .env.example .env.local   # then fill in both keys
npm run dev        # start the dev server
npm run lint       # eslint
npm run build      # production build
```

## Project structure

```
app/
  page.tsx                          landing page
  setup/page.tsx                     language selection
  conversation/page.tsx               the conversation
  api/assemblyai/token/route.ts       mints a short-lived AssemblyAI token (server-only)
  api/translate/route.ts              translates one utterance via Claude (server-only)
components/
  ui/                                generic building blocks (Button, Pill, Card, LanguageSelect)
  ohun/                              product components (Logo, HandsBridge, PersonPanel, ...)
lib/
  assemblyai/
    token.ts                          server-only: mints streaming tokens
    client.ts                         browser-only: opens the realtime session, picks the speech model
    useTranscriptionSession.ts         hook: mic → transcript → translation → playback
  translation/
    translate.ts                      server-only: calls Claude
    client.ts                         browser-only: calls /api/translate
  audio/
    recorder.ts                       browser-only: mic capture, resampling, PCM16
    player.ts                         browser-only: Web Speech playback
types/                                shared domain types (Language, MicState, ConnectionState, ...)
public/worklets/mic-pcm-worklet.js    AudioWorklet used by lib/audio/recorder.ts
```
