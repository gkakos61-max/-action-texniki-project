-- ACTION TEXNIKI PROJECT - DATABASE UPGRADE
-- Εκτέλεσε μία φορά στο Supabase SQL Editor.

alter table public.tasks add column if not exists provider text;
alter table public.tasks add column if not exists work_type text;

alter table public.task_files add column if not exists mime_type text;

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_checkins (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in ('arrive','depart')),
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;
alter table public.task_checkins enable row level security;

grant select, insert on public.activity_log to authenticated;
grant select, insert on public.task_checkins to authenticated;

drop policy if exists "activity_select" on public.activity_log;
drop policy if exists "activity_insert" on public.activity_log;
drop policy if exists "checkins_select" on public.task_checkins;
drop policy if exists "checkins_insert" on public.task_checkins;

create policy "activity_select" on public.activity_log
for select to authenticated
using (public.can_access_task(task_id));

create policy "activity_insert" on public.activity_log
for insert to authenticated
with check (user_id=auth.uid() and public.can_access_task(task_id));

create policy "checkins_select" on public.task_checkins
for select to authenticated
using (public.can_access_task(task_id));

create policy "checkins_insert" on public.task_checkins
for insert to authenticated
with check (user_id=auth.uid() and public.can_access_task(task_id));

-- Επιτρέπει στον admin να βλέπει όλους τους τεχνικούς και στον τεχνικό τον εαυτό του.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select to authenticated using (true);
