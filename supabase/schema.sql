-- ============================================================
-- Хэмнэл — хувийн цаг төлөвлөгч
-- Supabase → SQL Editor → New query → бүгдийг хуулж Run дарна.
-- Дахин ажиллуулахад алдаа гарахгүй (if not exists).
-- ============================================================

-- ---------- 1. Хэрэглэгчийн тохиргоо ----------
create table if not exists public.user_settings (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  theme        text not null default 'auto' check (theme in ('light','dark','auto')),
  urgent_hours int  not null default 48 check (urgent_hours between 1 and 336),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- 2. Ажил ----------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  description  text,
  category     text not null default 'Хувийн'
               check (category in ('Хичээл','Ажил','Хувийн','Эрүүл мэнд','Бусад')),
  due_at       timestamptz,
  important    boolean not null default false,
  urgent       boolean not null default false,
  status       text not null default 'todo' check (status in ('todo','done')),
  completed_at timestamptz,
  start_at     timestamptz,
  end_at       timestamptz,
  -- Хувилбар 2: давтагдах ажил
  repeat       text not null default 'none' check (repeat in ('none','daily','weekdays','weekly','monthly')),
  repeat_days  smallint[],
  series_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tasks_block_chk check (
    (start_at is null and end_at is null) or (start_at is not null and end_at is not null and end_at > start_at)
  )
);

create index if not exists tasks_user_due_idx   on public.tasks (user_id, due_at);
create index if not exists tasks_user_start_idx on public.tasks (user_id, start_at);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);

-- ---------- 3. updated_at автоматаар шинэчлэх ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.user_settings;
create trigger settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------- 4. Бүртгүүлэхэд тохиргоо автоматаар үүсгэх ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 5. Row Level Security ----------
alter table public.user_settings enable row level security;
alter table public.tasks         enable row level security;

drop policy if exists "settings_own" on public.user_settings;
create policy "settings_own" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "tasks_own" on public.tasks;
create policy "tasks_own" on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 6. Data API эрх ----------
-- Төсөл үүсгэхдээ «Automatically expose new tables»-ийг унтраасан байсан ч ажиллана.
-- Хэн юуг харахыг дээрх RLS дүрэм хязгаарлана.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tasks, public.user_settings to authenticated;

-- ============================================================
-- ХУВИЛБАР 2–3 (давтагдах ажил, Pomodoro)
-- Энэ файлыг дахин бүхэлд нь ажиллуулж болно.
-- ============================================================

-- Давтагдах гаригууд 0 (Ням) … 6 (Бямба)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_repeat_days_chk') then
    alter table public.tasks add constraint tasks_repeat_days_chk
      check (repeat_days is null or repeat_days <@ array[0,1,2,3,4,5,6]::smallint[]);
  end if;
end $$;

create index if not exists tasks_series_idx on public.tasks (series_id);

-- ---------- 7. Pomodoro ----------
create table if not exists public.pomodoro_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null default now(),
  minutes    int not null check (minutes between 1 and 120),
  created_at timestamptz not null default now()
);
create index if not exists pomodoro_user_started_idx on public.pomodoro_sessions (user_id, started_at);

alter table public.pomodoro_sessions enable row level security;
drop policy if exists "pomodoro_own" on public.pomodoro_sessions;
create policy "pomodoro_own" on public.pomodoro_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.pomodoro_sessions to authenticated;
