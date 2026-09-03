# How to use OHUN

A walkthrough of everything the app does, from creating an account to
running a translated group call. For setup and environment variables, see
[README.md](./README.md) instead — this is about *using* OHUN, not deploying
it.

## 1. Create an account

Go to `/signup` and fill in:

- **Display name** — shown to everyone you talk to.
- **Username** — how people find and @-mention you. Lowercase letters,
  numbers, and underscores, 3–20 characters.
- **Email and password.**
- **Language you speak** — one of English, French, Spanish, German,
  Portuguese, or Italian. This single setting drives every translation you
  receive: your chats, your calls, everything is translated *into* this
  language for you, and *out of* it for everyone you talk to. There's no
  "conversation language" to pick each time — each person's own profile
  setting is enough.

Confirm your email if prompted, then log in. You can change your language
later from `/profile`.

## 2. Find someone and start talking

On `/people`, search by `@username` or display name. Each result gives you
three ways to reach them:

- **Message** — opens (or reopens) your translated chat thread.
- **Call** — places a voice call.
- **Video call** (the small camera icon) — places a call with your camera
  already on, instead of starting a voice call and reaching for the camera
  toggle afterwards.

`/people` also shows your recent calls (tap to call back) and any calls
you've scheduled.

## 3. Messaging

Open a thread from `/chats` or by tapping **Message** on someone's search
result. Type normally — your message sends in your language and appears to
them already translated into theirs, and vice versa. Nothing needs to be
picked per-conversation; it's always each person's own profile language.

**Voice notes** work the same way: record one, and the recipient gets both
the translated text and can play back your original audio. Tap a
translated line to hear it spoken aloud in that language.

## 4. Calling someone

A call opens at `/call/[callId]`. While it's ringing, connecting, and live,
you'll see:

- **Live captions** — your speech transcribed and translated in real time,
  shown for both sides, with the most recent line highlighted below the
  avatars.
- **Spoken translation** — what you say is translated and spoken aloud on
  the other person's device (and vice versa); their raw voice briefly ducks
  under the translation so it stays intelligible, then returns to normal.
- **Mute** — stops sending your audio and pauses your side of transcription
  and captioning until you unmute.
- **Speaker** — mutes what you hear, without touching your own microphone.
- **Connection quality** — a status pill showing whether the call has a
  relay (TURN) available; "Limited" means it's working but more fragile on
  a restrictive network.

### Camera and screen share, mid-call

Both are optional add-ons to an ongoing call — turning either on or off
never interrupts captions or translation.

- **Camera** — tap the camera icon to turn your camera on or off. Works on
  every platform `getUserMedia` does, iOS Safari included. When both sides
  have their camera on, your own preview appears as a small overlay on
  their video.
- **Share screen** — tap the screen-share icon to share your screen instead
  of (or alongside) your camera. Not available on iOS — no browser there
  supports screen capture — so the button simply doesn't appear on a
  device that can't do it.

When the call ends, you land on a recap screen with a Claude-written
summary of what was actually discussed (once the call has enough
substance to summarise) — written in *your* language, regardless of what
language the other person spoke.

## 5. Group calls

From `/people`, tap **Start a group call** (or the camera icon beside it,
to start with your video already on). This opens an empty room at
`/room/[roomId]`; you add people to it from inside.

- **Add someone** — invite people in one at a time, up to 7 in the room
  including you.
- Everyone's speech is translated into every language actually present in
  the room and captioned for each participant in their own language —
  not just pairwise, all at once.
- **Camera** works the same as a 1:1 call: tap to turn yours on, and anyone
  who joins afterwards sees it automatically, without you doing anything
  further. There's no screen share in a group call.
- Mute and speaker controls work exactly as they do in a 1:1 call.

## 6. Your room link

Every account has a personal, shareable link — find it on `/profile` as
**Your room link** (`ohun.app/r/yourslug`). Anyone who opens it can start a
translated call with you directly:

- If they have an OHUN account, they call you as themselves.
- If they don't, they're prompted for just a name and their language —
  a lightweight guest identity, no signup required — and the call proceeds
  exactly as any other call would, translation included.

Put it in a bio or signature. You can **regenerate** the link at any time
from `/profile`, which invalidates the old one immediately.

## 7. Scheduling a call

Tap **Schedule** on someone's People result to book a call for later
(up to 90 days out). They receive an email invite with the time and a link
to join — sending the email requires the deployment to have email configured;
if it doesn't, the scheduled call still shows up on both your `/people`
pages either way. Scheduled calls appear under **Upcoming calls** for both
of you until it's time.

## 8. Notifications

Turn on **Get notified of new messages** (on `/chats`) to receive a push
notification for new messages even when the tab isn't open. Two things have
to both be true for it to actually work:

- You've allowed notifications when the browser asks.
- **On iPhone specifically**, OHUN has to be installed as a home-screen app
  first — iOS only delivers push to a page running as an installed PWA, not
  an ordinary Safari tab. From Safari: **Share → Add to Home Screen**, then
  open OHUN from that new home-screen icon (not from a bookmark or a
  browser tab) and turn notifications on from there. If you had OHUN on
  your home screen before this was set up, remove and re-add the icon once
  — an old icon doesn't retroactively gain the ability.

Without push configured on the deployment at all, or if you skip this, the
in-app banner still alerts you to new messages the moment you have OHUN
open.

## 9. The single-device demo

`/conversation` (via `/setup`) is a separate, simpler mode: pick two
languages on *one* device, and it acts as a walkie-talkie between them —
tap to talk, only one microphone active at a time, no accounts or calls
involved. Useful for trying OHUN out with someone sitting across from you
before either of you creates an account. It also supports Yoruba, unlike
real accounts and calls (see the note in the README).

## Tips and troubleshooting

- **Microphone/camera permission denied** — OHUN asks the browser directly;
  if you said no, re-allow it from the browser's own site settings and
  reload. A call clearly states which device access it couldn't get.
- **"Limited relay" during a call** — the call is connecting without a TURN
  relay available. It'll often still work, but is more likely to drop on a
  restrictive network (many corporate or campus Wi-Fi setups).
- **A translated line looks off** — tap it to hear it spoken aloud; OHUN
  translates meaning and tone rather than word-for-word, so it won't always
  read as a literal translation, especially for idioms.
- **Chat and calls always use each person's own profile language** — if a
  translation is landing in the wrong language, check `/profile` for the
  language currently set on that account.
