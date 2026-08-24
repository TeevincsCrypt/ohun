# OHUN

**Speak freely. Understand instantly.**

OHUN is a real-time voice language bridge. Two people who speak different
languages have a natural spoken conversation: each person talks normally in
their own language, OHUN captures the speech, transcribes it, translates the
meaning (not just the words) into the other person's language, and speaks
the translation aloud — so the conversation stays a conversation, not a
typing exercise.

Initial supported languages: **English, French, Spanish, Yoruba**.

## Current implementation status — Phase 1

This repository is being built in controlled phases. **Phase 1 (this
commit) is frontend-foundation only:**

- Next.js App Router + TypeScript + Tailwind CSS, production build passing.
- Three routes: `/` (landing), `/setup` (language selection), `/conversation`
  (conversation UI shell).
- A reusable component library (`components/ui`, `components/ohun`).
- Typed domain models (`types/`) and integration boundaries for the future
  voice pipeline (`lib/assemblyai`, `lib/translation`, `lib/audio`).

**What is intentionally NOT implemented yet:**

- No microphone capture, no audio streaming.
- No connection to AssemblyAI or any speech-to-text service.
- No translation calls.
- No text-to-speech / audio playback.

Every function in `lib/assemblyai`, `lib/translation`, and `lib/audio`
throws a `NotImplementedError` rather than returning fake/mocked data. The
mic button, connection status, and "repeat translation" control on the
conversation screen are rendered in their disconnected/disabled state on
purpose — they establish where the realtime system will plug in without
claiming it works.

Do not build on top of this expecting working voice/translation behavior —
that begins in Phase 2.

## Planned architecture

```
Browser (Next.js client)
  mic capture (lib/audio/recorder)
        │  raw audio chunks
        ▼
  AssemblyAI realtime streaming STT (lib/assemblyai)
        │  transcript (partial + final)
        ▼
  Translation service (lib/translation) — context-aware, not word-for-word
        │  translated text
        ▼
  Text-to-speech playback (lib/audio/player)
        │  synthesized audio
        ▼
  Other participant hears the translation
```

Planned phases:

- **Phase 1 (done):** frontend foundation — routes, components, types,
  integration boundaries, no live functionality.
- **Phase 2:** wire up real-time transcription (AssemblyAI streaming),
  microphone capture, and live transcript rendering.
- **Phase 3:** context-aware translation and text-to-speech playback,
  completing the end-to-end conversation loop.

## Environment variables (Phase 2+)

None are required to run Phase 1. These will be introduced as the
integrations behind them are implemented:

| Variable | Purpose |
| --- | --- |
| `ASSEMBLYAI_API_KEY` | Realtime speech-to-text streaming (AssemblyAI). |
| `TRANSLATION_API_KEY` | Context-aware translation provider. |
| `TTS_API_KEY` | Text-to-speech playback of translated speech. |

## Development

```bash
npm install
npm run dev      # start the dev server
npm run lint      # eslint
npm run build     # production build
```

## Project structure

```
app/
  page.tsx                  landing page
  setup/page.tsx             language selection
  conversation/page.tsx       conversation UI shell
components/
  ui/                        generic building blocks (Button, Pill, Card, LanguageSelect)
  ohun/                      product components (Logo, HandsBridge, PersonPanel, ...)
lib/
  assemblyai/                 speech-to-text integration boundary (not implemented)
  translation/                translation integration boundary (not implemented)
  audio/                      mic capture / playback boundary (not implemented)
types/                        shared domain types (Language, TranscriptEntry, ...)
```
