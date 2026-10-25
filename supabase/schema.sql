-- Garden Guide database. Safe to run more than once.
-- Each account sees and changes only its own rows (row level security).

create table if not exists public.gardens (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  location    text not null default '',
  label       text not null default '',
  timezone    text not null default 'UTC',
  overview    text not null default '',
  feed_token  uuid not null default gen_random_uuid() unique,
  setup_done  boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.plants (
  user_id     uuid not null references auth.users (id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, slug)
);

create table if not exists public.usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

create table if not exists public.usage_global (
  day   date primary key,
  count int  not null default 0
);

-- Added later: growing region preset (see library/regions.js).
alter table public.gardens add column if not exists region text not null default '';

alter table public.gardens      enable row level security;
alter table public.plants       enable row level security;
alter table public.usage        enable row level security;
alter table public.usage_global enable row level security;

drop policy if exists "own garden" on public.gardens;
create policy "own garden" on public.gardens
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own plants" on public.plants;
create policy "own plants" on public.plants
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own usage" on public.usage;
create policy "own usage" on public.usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Counts one Claude-written guide against the user's and everyone's daily caps.
-- Returns false (and counts nothing) when either cap is reached.
create or replace function public.bump_usage(p_user uuid, p_user_cap int, p_global_cap int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  d  date := (now() at time zone 'utc')::date;
  uc int;
  gc int;
begin
  insert into usage_global (day, count) values (d, 0) on conflict (day) do nothing;
  insert into usage (user_id, day, count) values (p_user, d, 0) on conflict (user_id, day) do nothing;
  select count into gc from usage_global where day = d for update;
  select count into uc from usage where user_id = p_user and day = d for update;
  if uc >= p_user_cap or gc >= p_global_cap then
    return false;
  end if;
  update usage_global set count = count + 1 where day = d;
  update usage set count = count + 1 where user_id = p_user and day = d;
  return true;
end;
$$;

revoke all on function public.bump_usage(uuid, int, int) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, int, int) to service_role;

grant select, insert, update, delete on public.gardens, public.plants to authenticated;
grant select on public.usage to authenticated;
