-- MISSION 33 database schema
-- Run this once in the Supabase SQL Editor.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  completed boolean not null default false,
  task_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists tasks_task_date_idx on tasks (task_date);

alter table tasks enable row level security;

drop policy if exists "public read" on tasks;
drop policy if exists "public insert" on tasks;
drop policy if exists "public update" on tasks;
drop policy if exists "public delete" on tasks;

create policy "public read"   on tasks for select using (true);
create policy "public insert" on tasks for insert with check (true);
create policy "public update" on tasks for update using (true) with check (true);
create policy "public delete" on tasks for delete using (true);
