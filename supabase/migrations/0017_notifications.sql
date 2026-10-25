-- 0017: Notifications — single outbox queue, push tokens/subscriptions, announcements, audit

create table if not exists hericilla_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references hericilla_profiles(id) on delete cascade,
  role_target text,                              -- e.g. 'admin','supervisor' — expands at send time
  channels hericilla_notification_channel[] not null default array['in_app']::hericilla_notification_channel[],
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  status hericilla_notification_status not null default 'queued',
  attempt_count integer not null default 0,
  next_retry_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists hericilla_notifications_seen (
  outbox_id uuid not null references hericilla_notification_outbox(id) on delete cascade,
  user_id uuid not null references hericilla_profiles(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (outbox_id, user_id)
);

create table if not exists hericilla_expo_push_tokens (
  token text primary key,
  user_id uuid not null references hericilla_profiles(id) on delete cascade,
  os text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists hericilla_web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references hericilla_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists hericilla_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text[] not null default array['staff','driver'],   -- roles to receive
  created_by uuid references hericilla_profiles(id),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Helper used by Edge Function/UI to enqueue
create or replace function public.hericilla_push_notification(
  target_user uuid, target_role text, chans hericilla_notification_channel[], ttl text, tbo text, payload jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into hericilla_notification_outbox (recipient_user_id, role_target, channels, title, body, data)
  values (target_user, target_role, chans, ttl, tbo, payload);
$$;

-- Expand role targets into per-user rows when consuming (run by notify function each cycle)
create or replace function public.hericilla_expand_role_notifications()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into hericilla_notification_outbox (recipient_user_id, channels, title, body, data, status)
  select p.id, o.channels, o.title, o.body, o.data || jsonb_build_object('expanded_from', o.id), 'queued'
  from hericilla_notification_outbox o
  join hericilla_profiles p on p.role::text = o.role_target and p.status = 'active'
  where o.role_target is not null and o.status = 'queued'
    and not exists (select 1 from hericilla_notification_outbox x
                    where x.data->>'expanded_from' = o.id::text);
  update hericilla_notification_outbox set status = 'sent', sent_at = now()
  where role_target is not null and status = 'queued'
    and exists (select 1 from hericilla_notification_outbox x where x.data->>'expanded_from' = id::text);
end $$;

-- Audit log (append-only)
create table if not exists hericilla_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,                -- insert | update | delete | approve | correct
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip inet default inet_client_addr(),
  at timestamptz not null default now()
);

create or replace function public.hericilla_write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into hericilla_audit_logs (actor_id, action, entity, entity_id, before_data, after_data)
  values (
    auth.uid(),
    case when TG_OP = 'INSERT' then 'insert'
         when TG_OP = 'UPDATE' then 'update'
         else 'delete' end,
    TG_TABLE_NAME,
    coalesce((case when TG_OP='DELETE' then old else new end)::text, ''),
    case when TG_OP in ('UPDATE','DELETE') then row_to_json(old)::jsonb else null end,
    case when TG_OP in ('INSERT','UPDATE') then row_to_json(new)::jsonb else null end
  );
  return coalesce(new, old);
end $$;

-- Sensitive tables get audit triggers
do $$ declare t text; begin
  foreach t in array array[
    'hericilla_invoices','hericilla_invoice_payments','hericilla_invoice_adjustments','hericilla_expenses','hericilla_trip_expenses',
    'hericilla_payroll_runs','hericilla_payslips','hericilla_salary_structures','hericilla_attendance_events','hericilla_attendance_corrections',
    'hericilla_purchase_requests','hericilla_purchase_orders','hericilla_approvals','hericilla_documents','hericilla_role_permissions','hericilla_app_settings'
  ] loop
    execute format('drop trigger if exists trg_audit_%I on %I', t, t);
    execute format(
      'create trigger trg_audit_%I after insert or update or delete on %I
       for each row execute function public.hericilla_write_audit()', t, t);
  end loop;
end $$;

-- Trim entity_id to id value only (the row_to_json already carries data)
create index if not exists idx_outbox_status on hericilla_notification_outbox (status, next_retry_at);
create index if not exists idx_outbox_recipient on hericilla_notification_outbox (recipient_user_id, created_at);
create index if not exists idx_audit_entity_time on hericilla_audit_logs (entity, at);
