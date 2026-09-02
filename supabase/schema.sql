-- OHUN Phase 4a schema.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Passwords are NOT stored here. Supabase manages them in auth.users with
-- its own hashing; `profiles` only holds public-facing account data.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           text not null,
  display_name       text not null,
  -- Restricted to the languages AssemblyAI streaming supports reliably.
  -- Yoruba is deliberately excluded — see README.
  preferred_language text not null check (preferred_language in ('en', 'fr', 'es', 'de', 'pt', 'it')),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),

  -- 3-20 chars, lowercase alphanumeric + underscore.
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

-- Unique, case-insensitive, and the index that backs username lookup.
create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

-- Prefix search on display name.
create index if not exists profiles_display_name_idx
  on public.profiles (lower(display_name));

-- ---------------------------------------------------------------------------
-- calls
-- ---------------------------------------------------------------------------
do $$ begin
  create type call_status as enum
    ('ringing', 'accepted', 'connected', 'declined', 'ended', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.calls (
  id                uuid primary key default gen_random_uuid(),
  caller_id         uuid not null references public.profiles(id) on delete cascade,
  receiver_id       uuid not null references public.profiles(id) on delete cascade,
  status            call_status not null default 'ringing',
  -- Snapshotted at call time so the room is not affected by a later
  -- profile edit, and so both directions are known explicitly.
  caller_language   text not null check (caller_language in ('en', 'fr', 'es', 'de', 'pt', 'it')),
  receiver_language text not null check (receiver_language in ('en', 'fr', 'es', 'de', 'pt', 'it')),
  created_at        timestamptz not null default now(),
  ended_at          timestamptz,

  constraint no_self_call check (caller_id <> receiver_id)
);

-- Finding a user's active/incoming calls.
create index if not exists calls_receiver_status_idx
  on public.calls (receiver_id, status);
create index if not exists calls_caller_status_idx
  on public.calls (caller_id, status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.calls    enable row level security;

-- Readable by anyone, including a not-yet-authenticated signup form checking
-- username availability. Usernames and display names are meant to be
-- discoverable (that's the whole point of search) and carry no secret —
-- email and password live in auth.users, not here.
drop policy if exists "profiles readable by authenticated" on public.profiles;
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- Direct inserts are only ever done by the signup trigger below, which runs
-- as security definer and bypasses RLS entirely. This policy is defense in
-- depth, not the normal path — it still stops any other client from
-- inserting as someone else.
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- You can only see calls you are a party to.
drop policy if exists "read own calls" on public.calls;
create policy "read own calls"
  on public.calls for select
  to authenticated
  using (auth.uid() = caller_id or auth.uid() = receiver_id);

-- You may only place a call as yourself.
drop policy if exists "create call as caller" on public.calls;
create policy "create call as caller"
  on public.calls for insert
  to authenticated
  with check (auth.uid() = caller_id);

-- Either party may change call state (accept, decline, end). This is what
-- stops a third party accepting or ending someone else's call.
drop policy if exists "update own calls" on public.calls;
create policy "update own calls"
  on public.calls for update
  to authenticated
  using (auth.uid() = caller_id or auth.uid() = receiver_id)
  with check (auth.uid() = caller_id or auth.uid() = receiver_id);

-- ---------------------------------------------------------------------------
-- Auto-create the profile row when a new auth user signs up.
--
-- signUp() cannot reliably insert the profile itself: if the Supabase
-- project requires email confirmation (the default for a new project),
-- signUp() returns a user but no session, so a client-side insert right
-- after runs unauthenticated and RLS correctly rejects it (auth.uid() is
-- null). SECURITY DEFINER runs this in the same transaction as the
-- auth.users insert, as the function owner rather than the calling client,
-- so it succeeds regardless of session state — Supabase's own documented
-- pattern for this exact situation.
--
-- Username, display name and language are passed through signUp()'s
-- options.data and land in raw_user_meta_data.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, preferred_language)
  values (
    new.id,
    lower(new.raw_user_meta_data ->> 'username'),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime: the client subscribes to call rows to drive ring/accept/end.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Phase 5: profile extras (avatar, phone) + scheduled calls.
-- Safe to re-run; every statement is idempotent.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists phone      text;

-- E.164-ish: a leading + and 7-15 digits. Nullable, so an empty profile is
-- still valid; the constraint only bites once a number is actually set.
do $$ begin
  alter table public.profiles
    add constraint phone_format check (phone is null or phone ~ '^\+[1-9]\d{6,14}$');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- scheduled_calls
-- ---------------------------------------------------------------------------
do $$ begin
  create type scheduled_call_status as enum ('pending', 'started', 'cancelled', 'missed');
exception when duplicate_object then null;
end $$;

create table if not exists public.scheduled_calls (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id   uuid not null references public.profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  note         text,
  status       scheduled_call_status not null default 'pending',
  -- Set once the scheduled call is actually placed, linking the two.
  call_id      uuid references public.calls(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint no_self_schedule check (organizer_id <> invitee_id),
  constraint note_length check (note is null or char_length(note) <= 280)
);

-- Drives "what's coming up" for both sides.
create index if not exists scheduled_calls_organizer_idx
  on public.scheduled_calls (organizer_id, scheduled_at);
create index if not exists scheduled_calls_invitee_idx
  on public.scheduled_calls (invitee_id, scheduled_at);

alter table public.scheduled_calls enable row level security;

-- You only ever see a scheduled call you are a party to.
drop policy if exists "read own scheduled calls" on public.scheduled_calls;
create policy "read own scheduled calls"
  on public.scheduled_calls for select
  to authenticated
  using (auth.uid() = organizer_id or auth.uid() = invitee_id);

-- You may only schedule as yourself.
drop policy if exists "create scheduled call as organizer" on public.scheduled_calls;
create policy "create scheduled call as organizer"
  on public.scheduled_calls for insert
  to authenticated
  with check (auth.uid() = organizer_id);

-- Either party may cancel; the organizer may reschedule.
drop policy if exists "update own scheduled calls" on public.scheduled_calls;
create policy "update own scheduled calls"
  on public.scheduled_calls for update
  to authenticated
  using (auth.uid() = organizer_id or auth.uid() = invitee_id)
  with check (auth.uid() = organizer_id or auth.uid() = invitee_id);

drop policy if exists "delete own scheduled calls" on public.scheduled_calls;
create policy "delete own scheduled calls"
  on public.scheduled_calls for delete
  to authenticated
  using (auth.uid() = organizer_id);

-- Realtime so an invitee sees a new invitation without reloading.
do $$ begin
  alter publication supabase_realtime add table public.scheduled_calls;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Avatar storage.
--
-- Public bucket: avatars are shown next to usernames in search results, so
-- they are already public information. Writes are still restricted to the
-- owner by the policies below, keyed on the first path segment being the
-- user's own id (i.e. avatars/<uid>/<file>).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Phase 6: billing columns. Retained but no longer used by the app.
--
-- OHUN is free: there is no plan, no quota and no checkout. These columns
-- are left in place rather than dropped because dropping is destructive and
-- irreversible, and an unused column costs nothing. Nothing reads or writes
-- them, so they simply sit at their defaults.
--
-- The column privilege block further down still names them, which is why
-- they are defined here at all: revoking table-wide UPDATE and granting
-- back an explicit list is what protects every column not on that list, and
-- that mechanism is still doing real work for room_slug and is_guest.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists subscription_status      text not null default 'free',
  add column if not exists subscription_product_id  text,
  add column if not exists free_calls_used           integer not null default 0,
  add column if not exists free_period_started_at    timestamptz not null default now();

do $$ begin
  alter table public.profiles
    add constraint subscription_status_values check (subscription_status in ('free', 'active'));
exception when duplicate_object then null;
end $$;

-- Column privileges, layered UNDER row level security rather than replacing
-- it. The "update own profile" RLS policy above lets a user update their own
-- row at all, which is correct for display_name/phone/preferred_language/
-- avatar_url. It says nothing about *which* columns, though, so without the
-- restriction below anyone could open devtools and run
--   supabase.from('profiles').update({ subscription_status: 'active' })
-- to grant themselves a paid plan for free.
--
-- This has to be a table-level revoke followed by an explicit allow-list.
-- Supabase grants table-wide UPDATE to `authenticated`, and a column-level
-- `revoke update (col)` does NOT remove a table-level grant — it only drops
-- a column-level one, so on its own it would be a no-op.
--
-- Every column not granted here is writable only by the service-role client
-- (see lib/supabase/admin.ts), which bypasses grants entirely. The grant is
-- restated after Phase 8 adds room_slug and is_guest, so re-running this
-- file top to bottom always lands on the full allow-list.
revoke update on public.profiles from authenticated, anon;

grant update (
  display_name,
  preferred_language,
  phone,
  avatar_url,
  last_seen_at
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Phase 7: recent activity.
--
-- ended_at alone cannot give a call's real length, because created_at is
-- when the phone started ringing, not when the two sides connected. Stamp
-- the connection separately so history can show talk time rather than
-- ring-plus-talk time.
-- ---------------------------------------------------------------------------
alter table public.calls
  add column if not exists connected_at timestamptz;

-- Backs the history query: a user's calls, newest first.
create index if not exists calls_caller_created_idx
  on public.calls (caller_id, created_at desc);
create index if not exists calls_receiver_created_idx
  on public.calls (receiver_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Phase 8: shareable room links.
--
-- A room link is "dial this person" as a URL, so it can go in a bio and be
-- opened by someone with no account. Two things follow from that:
--
--   * The slug is random and rotatable rather than being the username. A
--     link posted publicly is one you may need to revoke after it attracts
--     the wrong attention, and you cannot revoke a username.
--   * Visitors without an account sign in anonymously, which creates a real
--     auth.users row — so RLS, the calls table and the profile trigger all
--     work unchanged rather than needing a parallel guest path.
-- ---------------------------------------------------------------------------

-- 10 chars of base32-ish alphabet, ambiguous characters removed so a slug
-- can be read aloud or copied off a screen without confusion.
create or replace function public.generate_room_slug()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('abcdefghjkmnpqrstuvwxyz23456789', floor(random() * 31)::int + 1, 1),
    ''
  )
  from generate_series(1, 10);
$$;

alter table public.profiles
  add column if not exists room_slug text,
  -- Anonymous visitors get a profile so calls work, but they are not real
  -- accounts: they must not surface in username search.
  add column if not exists is_guest boolean not null default false;

-- Backfill existing rows before the unique index goes on.
update public.profiles set room_slug = public.generate_room_slug()
where room_slug is null;

alter table public.profiles
  alter column room_slug set default public.generate_room_slug();

create unique index if not exists profiles_room_slug_key
  on public.profiles (room_slug);

-- room_slug is how a link is revoked, so it must not be writable by the
-- client directly — rotation goes through a server action that regenerates
-- it. is_guest decides search visibility and must not be self-serve either.
--
-- Neither column appears in the grant below, which is what keeps them out
-- of a client's reach. Restated here rather than only in the billing
-- section above so that this file is correct whether it is run whole or
-- from this section onwards.
revoke update on public.profiles from authenticated, anon;

grant update (
  display_name,
  preferred_language,
  phone,
  avatar_url,
  last_seen_at
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- The signup trigger has to cope with anonymous users now: they arrive with
-- no email and no metadata, so the previous split_part(new.email, ...) would
-- have produced a null display name and a null username.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_username text := lower(new.raw_user_meta_data ->> 'username');
  is_anon boolean := new.email is null;
begin
  insert into public.profiles (id, username, display_name, preferred_language, is_guest)
  values (
    new.id,
    -- Guests never pick a username; generate one that cannot collide with
    -- a real signup, which is constrained to 3-20 chars of [a-z0-9_].
    coalesce(meta_username, 'guest_' || substr(replace(new.id::text, '-', ''), 1, 12)),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      case when is_anon then 'Guest' else split_part(new.email, '@', 1) end
    ),
    -- Metadata is client-supplied, so an unexpected value would otherwise
    -- trip the check constraint and fail the whole signup. Coerce instead.
    case
      when new.raw_user_meta_data ->> 'preferred_language' in ('en', 'fr', 'es', 'de', 'pt', 'it')
        then new.raw_user_meta_data ->> 'preferred_language'
      else 'en'
    end,
    is_anon
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phase 9: German, Portuguese and Italian.
--
-- The language checks above only apply to a freshly created table. On a
-- database that already exists the old three-language constraints are still
-- attached, so they have to be dropped and rebuilt for the wider set.
-- Yoruba stays out: AssemblyAI's streaming models cannot transcribe it, so
-- offering it on calls would mean speech that never becomes text.
-- ---------------------------------------------------------------------------
do $$
declare
  allowed text := $c$ in ('en', 'fr', 'es', 'de', 'pt', 'it')$c$;
begin
  alter table public.profiles drop constraint if exists profiles_preferred_language_check;
  execute 'alter table public.profiles add constraint profiles_preferred_language_check
           check (preferred_language' || allowed || ')';

  alter table public.calls drop constraint if exists calls_caller_language_check;
  execute 'alter table public.calls add constraint calls_caller_language_check
           check (caller_language' || allowed || ')';

  alter table public.calls drop constraint if exists calls_receiver_language_check;
  execute 'alter table public.calls add constraint calls_receiver_language_check
           check (receiver_language' || allowed || ')';
end $$;

-- ---------------------------------------------------------------------------
-- Phase 10: group calls.
--
-- Kept as its own pair of tables rather than widening `calls`, which is
-- structurally one-to-one (caller_id/receiver_id) and still serves every
-- existing direct call. Nothing here touches that path.
-- ---------------------------------------------------------------------------

create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'live' check (status in ('live', 'ended')),
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);

create index if not exists rooms_host_idx on public.rooms (host_id, created_at desc);

create table if not exists public.room_participants (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- Snapshotted, like calls.caller_language: a profile edit mid-call must
  -- not silently change which language someone is being translated into.
  language   text not null check (language in ('en', 'fr', 'es', 'de', 'pt', 'it')),
  invited_by uuid references public.profiles(id) on delete set null,
  state      text not null default 'invited'
             check (state in ('invited', 'joined', 'left', 'declined')),
  joined_at  timestamptz,
  left_at    timestamptz,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_participants_user_idx
  on public.room_participants (user_id, state);

-- ---------------------------------------------------------------------------
-- Membership test used by every policy below.
--
-- SECURITY DEFINER on purpose. The obvious policy — "you may read
-- room_participants rows for rooms you are a participant of" — has to query
-- room_participants to answer that, which re-enters the same policy and
-- recurses until Postgres gives up. Reading membership through a definer
-- function runs that lookup with RLS bypassed, which breaks the cycle.
--
-- It is safe to expose: it answers only a yes/no about the caller's own
-- membership and returns no row data.
-- ---------------------------------------------------------------------------
create or replace function public.is_room_participant(target_room uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_participants
    where room_id = target_room
      and user_id = target_user
      and state <> 'declined'
  );
$$;

revoke all on function public.is_room_participant(uuid, uuid) from public, anon;
grant execute on function public.is_room_participant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cap the room size. A check constraint cannot count sibling rows, so this
-- is a trigger. Declined and departed participants do not count against the
-- cap — only people currently in or on their way into the room.
--
-- It has to cover UPDATE as well as INSERT. Someone who left keeps their
-- row, so rejoining is an UPDATE back into 'joined'; on INSERT alone a full
-- room could be pushed past the cap by a leaver rejoining into a seat that
-- had already been given away.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_room_capacity()
returns trigger
language plpgsql
as $$
declare
  occupants integer;
begin
  -- Only entering the room can overfill it. Leaving, declining, or editing
  -- a row that is already seated is always allowed.
  if tg_op = 'UPDATE'
     and (old.state in ('invited', 'joined') or new.state not in ('invited', 'joined'))
  then
    return new;
  end if;

  select count(*) into occupants
  from public.room_participants
  where room_id = new.room_id
    and state in ('invited', 'joined')
    and user_id <> new.user_id;

  if occupants >= 7 then
    raise exception 'This call is full (7 people maximum).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists room_capacity on public.room_participants;
create trigger room_capacity
  before insert or update of state on public.room_participants
  for each row execute function public.enforce_room_capacity();

alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;

-- The host clause is not redundant with the membership test. Creating a
-- room and seating its host are two statements, so between them the host
-- is not yet a participant — and `insert ... returning` runs this policy
-- to decide whether the new row may be read back. Without the host clause
-- the insert succeeds and the RETURNING comes back empty, which reads to
-- the caller as "could not create the room".
drop policy if exists "read rooms you are in" on public.rooms;
create policy "read rooms you are in" on public.rooms
  for select to authenticated
  using (host_id = auth.uid() or public.is_room_participant(id, auth.uid()));

drop policy if exists "create your own room" on public.rooms;
create policy "create your own room" on public.rooms
  for insert to authenticated
  with check (host_id = auth.uid());

-- Anyone in the room may end it, which is what lets the last person out
-- close it rather than leaving a live room nobody is in.
drop policy if exists "update rooms you are in" on public.rooms;
create policy "update rooms you are in" on public.rooms
  for update to authenticated
  using (public.is_room_participant(id, auth.uid()));

drop policy if exists "read participants of your rooms" on public.room_participants;
create policy "read participants of your rooms" on public.room_participants
  for select to authenticated
  using (public.is_room_participant(room_id, auth.uid()));

-- Adding people is open to anyone already in the room, so a call can grow
-- without routing every invite through the host. Adding *yourself* is how
-- the host's own first row is created.
drop policy if exists "add people to your rooms" on public.room_participants;
create policy "add people to your rooms" on public.room_participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_room_participant(room_id, auth.uid())
  );

-- You may only move your own row: accept, decline, join, leave.
drop policy if exists "update your own participation" on public.room_participants;
create policy "update your own participation" on public.room_participants
  for update to authenticated
  using (user_id = auth.uid());

-- Re-inviting someone needs its own narrow permission.
--
-- A participant's row is kept when they leave or decline, so inviting them
-- again is an UPDATE of a row belonging to someone else — which the policy
-- above rightly refuses. Without this, asking back anyone who has already
-- said no, or who dropped out and wants to return, simply fails.
--
-- Deliberately narrow: it only applies to rows that are already 'left' or
-- 'declined', and the WITH CHECK allows setting them to nothing but
-- 'invited'. It cannot be used to remove someone, to pull them into a call
-- without their agreeing, or to change a seated participant's language.
drop policy if exists "re-invite a departed participant" on public.room_participants;
create policy "re-invite a departed participant" on public.room_participants
  for update to authenticated
  using (
    public.is_room_participant(room_id, auth.uid())
    and state in ('left', 'declined')
  )
  with check (state = 'invited');

do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.room_participants;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Phase 11: transcripts and post-call summaries.
--
-- Every call already produces a full multilingual transcript and then threw
-- it away when the room closed. Storing it costs little and is what makes a
-- summary possible at all.
--
-- One table covers both kinds of call: exactly one of call_id / room_id is
-- set, which the check below enforces. A separate table per kind would mean
-- duplicating the policies and the summary path for no gain.
-- ---------------------------------------------------------------------------

create table if not exists public.utterances (
  id          uuid primary key default gen_random_uuid(),
  call_id     uuid references public.calls(id) on delete cascade,
  room_id     uuid references public.rooms(id) on delete cascade,
  speaker_id  uuid not null references public.profiles(id) on delete cascade,
  -- What was actually said, and the language it was actually said in —
  -- which is the detected one, not the speaker's profile setting.
  original_text text not null,
  spoken_language text not null
    check (spoken_language in ('en', 'fr', 'es', 'de', 'pt', 'it')),
  -- Every language it was rendered into, keyed by code.
  translations jsonb not null default '{}'::jsonb,
  said_at     timestamptz not null default now(),

  constraint utterance_belongs_to_one_call
    check ((call_id is null) <> (room_id is null))
);

create index if not exists utterances_call_idx on public.utterances (call_id, said_at);
create index if not exists utterances_room_idx on public.utterances (room_id, said_at);

create table if not exists public.call_summaries (
  id         uuid primary key default gen_random_uuid(),
  call_id    uuid unique references public.calls(id) on delete cascade,
  room_id    uuid unique references public.rooms(id) on delete cascade,
  -- Keyed by language code, so each participant reads the summary in their
  -- own language rather than the one the conversation happened to start in.
  summaries  jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint summary_belongs_to_one_call
    check ((call_id is null) <> (room_id is null))
);

-- ---------------------------------------------------------------------------
-- Visibility follows the call the row belongs to. Written as definer
-- functions for the same reason is_room_participant is: a policy that has to
-- read another table to answer re-enters that table's own policies, and for
-- rooms that recurses.
-- ---------------------------------------------------------------------------
create or replace function public.can_read_call(target_call uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.calls
    where id = target_call
      and (caller_id = auth.uid() or receiver_id = auth.uid())
  );
$$;

revoke all on function public.can_read_call(uuid) from public, anon;
grant execute on function public.can_read_call(uuid) to authenticated;

alter table public.utterances enable row level security;
alter table public.call_summaries enable row level security;

drop policy if exists "read utterances from your calls" on public.utterances;
create policy "read utterances from your calls" on public.utterances
  for select to authenticated
  using (
    (call_id is not null and public.can_read_call(call_id))
    or (room_id is not null and public.is_room_participant(room_id, auth.uid()))
  );

-- You may only record your own speech, and only into a call you are in.
drop policy if exists "record your own utterances" on public.utterances;
create policy "record your own utterances" on public.utterances
  for insert to authenticated
  with check (
    speaker_id = auth.uid()
    and (
      (call_id is not null and public.can_read_call(call_id))
      or (room_id is not null and public.is_room_participant(room_id, auth.uid()))
    )
  );

drop policy if exists "read summaries from your calls" on public.call_summaries;
create policy "read summaries from your calls" on public.call_summaries
  for select to authenticated
  using (
    (call_id is not null and public.can_read_call(call_id))
    or (room_id is not null and public.is_room_participant(room_id, auth.uid()))
  );

-- Summaries are written by the server through the service-role client, which
-- bypasses RLS. No insert or update policy exists here on purpose: a client
-- must not be able to author a summary of its own conversation.

-- ---------------------------------------------------------------------------
-- Phase 12: translated chat.
--
-- The same idea as a call, asynchronous. You write in your language; every
-- other member of the thread reads it in theirs. Translations are computed
-- once, when the message is sent, and stored — not re-derived per reader.
-- A message is a permanent record that several people will open at
-- different times, so translating on read would mean paying for and waiting
-- on the same translation repeatedly, and worse, two readers of the same
-- language could see different wordings of one message.
--
-- Threads are modelled as membership rows rather than a pair of columns, so
-- the same tables carry a group thread later without a migration. Today
-- every thread is opened with exactly two members.
-- ---------------------------------------------------------------------------

create table if not exists public.chat_threads (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- Denormalised so the thread list can order by recency without a join
  -- onto the messages table for every row.
  last_message_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  -- Snapshotted at join time, exactly as calls and rooms snapshot theirs:
  -- the language a message was translated into is a property of the message
  -- as sent, and a later profile edit must not make old messages look wrong.
  language  text not null check (language in ('en', 'fr', 'es', 'de', 'pt', 'it')),
  joined_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists chat_members_user_idx on public.chat_members (user_id);

create table if not exists public.chat_messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references public.chat_threads(id) on delete cascade,
  sender_id         uuid not null references public.profiles(id) on delete cascade,
  kind              text not null default 'text' check (kind in ('text', 'voice')),
  -- What the sender actually wrote or said, in their own language.
  original_text     text not null default '',
  original_language text not null check (original_language in ('en', 'fr', 'es', 'de', 'pt', 'it', 'yo')),
  -- Voice notes only: the object in the voice-notes bucket, and how long it
  -- runs, so the player can size its waveform before fetching the audio.
  audio_path        text,
  duration_ms       integer,
  created_at        timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at desc);

-- One row per language a message was rendered into. The sender's own
-- language is not stored here — that is chat_messages.original_text.
create table if not exists public.chat_translations (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  language   text not null check (language in ('en', 'fr', 'es', 'de', 'pt', 'it', 'yo')),
  text       text not null,
  primary key (message_id, language)
);

-- ---------------------------------------------------------------------------
-- Membership test used by every policy below.
--
-- SECURITY DEFINER for the same reason as is_room_participant: the natural
-- policy on chat_members has to read chat_members to decide whether you may
-- read chat_members, which recurses until Postgres gives up. Answering the
-- question with RLS bypassed breaks the cycle.
--
-- Safe to expose: it returns a yes/no about the caller's own membership and
-- no row data.
-- ---------------------------------------------------------------------------
create or replace function public.is_chat_member(target_thread uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where thread_id = target_thread and user_id = target_user
  );
$$;

revoke all on function public.is_chat_member(uuid, uuid) from public, anon;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated;

alter table public.chat_threads      enable row level security;
alter table public.chat_members      enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.chat_translations enable row level security;

-- --- threads ---------------------------------------------------------------
-- `or created_by = auth.uid()` is not redundant with membership, and the
-- thread cannot be opened without it. Seating the first member requires
-- reading the thread to check who created it, but at that instant the
-- thread has no members — so a membership-only rule can never be satisfied
-- and every new thread is dead on arrival. The creator is admissible on
-- their own thread, which breaks the cycle; a moment later they are a
-- member like anyone else.
drop policy if exists "members read their threads" on public.chat_threads;
create policy "members read their threads"
  on public.chat_threads for select
  to authenticated
  using (public.is_chat_member(id, auth.uid()) or created_by = auth.uid());

-- `insert ... returning` runs the SELECT policy on the new row, and at that
-- moment no membership row exists yet — so the creator has to be admissible
-- on their own account, exactly as rooms are.
drop policy if exists "users open threads" on public.chat_threads;
create policy "users open threads"
  on public.chat_threads for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "members touch their threads" on public.chat_threads;
create policy "members touch their threads"
  on public.chat_threads for update
  to authenticated
  using (public.is_chat_member(id, auth.uid()))
  with check (public.is_chat_member(id, auth.uid()));

-- --- members ---------------------------------------------------------------
drop policy if exists "members read the roster" on public.chat_members;
create policy "members read the roster"
  on public.chat_members for select
  to authenticated
  using (public.is_chat_member(thread_id, auth.uid()));

-- Seating is done by whoever opened the thread, which covers both rows of a
-- new one-to-one thread in a single statement.
drop policy if exists "thread opener seats members" on public.chat_members;
create policy "thread opener seats members"
  on public.chat_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.created_by = auth.uid()
    )
  );

-- --- messages --------------------------------------------------------------
drop policy if exists "members read messages" on public.chat_messages;
create policy "members read messages"
  on public.chat_messages for select
  to authenticated
  using (public.is_chat_member(thread_id, auth.uid()));

drop policy if exists "members send messages" on public.chat_messages;
create policy "members send messages"
  on public.chat_messages for insert
  to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(thread_id, auth.uid()));

-- --- translations ----------------------------------------------------------
drop policy if exists "members read translations" on public.chat_translations;
create policy "members read translations"
  on public.chat_translations for select
  to authenticated
  using (
    exists (
      select 1 from public.chat_messages m
      where m.id = message_id and public.is_chat_member(m.thread_id, auth.uid())
    )
  );

-- Only the sender writes the translations of their own message, so a member
-- cannot put words in someone else's mouth in a language they cannot read.
drop policy if exists "senders write their translations" on public.chat_translations;
create policy "senders write their translations"
  on public.chat_translations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Voice notes.
--
-- Private, unlike avatars: a voice note is conversation content, readable
-- only by the thread it was sent to. Objects are stored as
-- voice-notes/<thread-id>/<file>, and the policies below check membership
-- of that leading folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

-- The first path segment is user input, so it is not necessarily a uuid.
-- A bad cast inside a policy would raise rather than deny, which turns a
-- malformed key into an error instead of a refusal — hence the explicit
-- catch.
create or replace function public.is_chat_member_of_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  thread_id uuid;
begin
  begin
    thread_id := split_part(object_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;

  return public.is_chat_member(thread_id, auth.uid());
end;
$$;

revoke all on function public.is_chat_member_of_path(text) from public, anon;
grant execute on function public.is_chat_member_of_path(text) to authenticated;

drop policy if exists "thread members read voice notes" on storage.objects;
create policy "thread members read voice notes"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'voice-notes' and public.is_chat_member_of_path(name));

drop policy if exists "thread members upload voice notes" on storage.objects;
create policy "thread members upload voice notes"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'voice-notes' and public.is_chat_member_of_path(name));

-- ---------------------------------------------------------------------------
-- Phase 13: repairing a message that lost its translation.
--
-- Translation happens when a message is sent, and that step can fail — a
-- rate limit, a timed-out request, a function killed at its deadline. The
-- message is still delivered (losing what someone wrote because a
-- translation call failed would be far worse), so a gap can outlive the
-- moment that caused it, and until now nothing ever closed it: the reader
-- saw a language they cannot read, permanently.
--
-- A reader may therefore fill in the gap for themselves. Strictly for
-- themselves: only into the language they joined the thread with, so this
-- cannot be used to put words in anyone's mouth in a language they cannot
-- check. Everything else stays the sender's to write.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for the usual reason: a policy on chat_translations that
-- had to read chat_members and chat_messages through their own policies
-- would be evaluating policies inside a policy. This answers the narrow
-- question directly — "which language did the caller join this message's
-- thread with?" — and returns nothing else.
create or replace function public.chat_member_language(target_message uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select cm.language
  from public.chat_messages m
  join public.chat_members cm
    on cm.thread_id = m.thread_id
  where m.id = target_message
    and cm.user_id = auth.uid();
$$;

revoke all on function public.chat_member_language(uuid) from public, anon;
grant execute on function public.chat_member_language(uuid) to authenticated;

drop policy if exists "members backfill their own language" on public.chat_translations;
create policy "members backfill their own language"
  on public.chat_translations for insert
  to authenticated
  with check (language = public.chat_member_language(message_id));
