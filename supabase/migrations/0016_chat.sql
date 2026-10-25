-- 0016: Website live chat (visitor ↔ admin agents) via Supabase Realtime

create table if not exists hericilla_chat_threads (
  id uuid primary key default gen_random_uuid(),
  visitor_token uuid not null default gen_random_uuid(),  -- anonymous auth for visitors
  visitor_name text,
  visitor_contact text,                                   -- email/phone if provided
  status hericilla_chat_status not null default 'open',
  assigned_admin uuid references hericilla_profiles(id),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists hericilla_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references hericilla_chat_threads(id) on delete cascade,
  sender_role text not null check (sender_role in ('visitor','agent')),
  sender_id uuid references hericilla_profiles(id),
  body text not null,
  attachments text[] not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table hericilla_chat_threads add column if not exists last_message_sender text;

-- Keep thread ordering cheap for the inbox list
create or replace function public.hericilla_touch_thread_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update hericilla_chat_threads set last_message_at = new.created_at,
                          last_message_sender = new.sender_role
    where id = new.thread_id;
  return new;
end $$;

drop trigger if exists trg_chat_touch on hericilla_chat_messages;
create trigger trg_chat_touch
  after insert on hericilla_chat_messages
  for each row execute function public.hericilla_touch_thread_on_message();

create index if not exists idx_cm_thread_time on hericilla_chat_messages (thread_id, created_at);
create index if not exists idx_ct_status on hericilla_chat_threads (status, last_message_at);

-- Realtime: only chat tables are published (keep channels lean)
-- `alter publication … add table` has no if-not-exists form and re-adding a member raises
-- duplicate_object, which would abort the file on a re-run. Membership is checked in the catalog
-- instead, so this block is safe to execute as many times as the tables around it.
do $$
declare t text;
begin
  foreach t in array array['hericilla_chat_messages', 'hericilla_chat_threads'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
