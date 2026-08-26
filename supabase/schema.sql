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
  preferred_language text not null check (preferred_language in ('en', 'fr', 'es')),
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
  caller_language   text not null check (caller_language in ('en', 'fr', 'es')),
  receiver_language text not null check (receiver_language in ('en', 'fr', 'es')),
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

-- Any signed-in user can read profiles (required for search); you may only
-- create or modify your own. This is what prevents impersonation.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

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
-- Realtime: the client subscribes to call rows to drive ring/accept/end.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null;
end $$;
