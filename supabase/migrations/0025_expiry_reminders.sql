-- 0025: Expiry reminder scheduler — daily scan of vehicles, supplier contracts,
-- staff certifications and driver licences; one reminder per expiry date per
-- entity (dedup table), pushed into the notification outbox. Documents are
-- already swept by hericilla_check_document_expiry() (0009) — the cron runs both.
-- Scheduled with pg_cron when the extension is available (hosted Supabase);
-- the DO block degrades gracefully on local stacks without it.

-- Offset (days before expiry) configurable in app_settings.
insert into hericilla_app_settings (key, value, description) values
  ('expiry_reminder_days', '30', 'How many days before an expiry date the first reminder is sent')
on conflict (key) do nothing;

-- Dedup ledger: we notify once per (entity, row, expiry date).
create table if not exists hericilla_expiry_reminders (
  entity text not null,
  entity_id text not null,
  expiry_date date not null,
  notified_at timestamptz not null default now(),
  primary key (entity, entity_id, expiry_date)
);
alter table hericilla_expiry_reminders enable row level security;
-- No policies: deny-by-default. Only security-definer functions below touch it.

create or replace function public.hericilla_notify_upcoming_expiries()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_days integer;
  v_count integer := 0;
  r record;
begin
  select coalesce((value #>> '{}')::integer, 30) into v_days
  from hericilla_app_settings where key = 'expiry_reminder_days';

  -- Vehicle insurance & inspection
  for r in
    select v.id, v.reg_no, v.insurance_expiry, v.inspection_expiry
    from hericilla_vehicles v
    where v.status <> 'retired'
      and (v.insurance_expiry between current_date and current_date + v_days
        or v.inspection_expiry between current_date and current_date + v_days)
  loop
    if r.insurance_expiry is not null
       and r.insurance_expiry between current_date and current_date + v_days
       and not exists (select 1 from hericilla_expiry_reminders e
                       where e.entity = 'vehicle_insurance' and e.entity_id = r.id::text
                         and e.expiry_date = r.insurance_expiry) then
      perform hericilla_push_notification(null, 'logistics_officer', array['in_app','email']::hericilla_notification_channel[],
        'Vehicle insurance expiring',
        format('%s insurance expires on %s. Renew the policy and upload the certificate.', r.reg_no, r.insurance_expiry),
        jsonb_build_object('url', '/vehicles', 'entity', 'vehicle_insurance', 'entity_id', r.id, 'expiry_date', r.insurance_expiry));
      insert into hericilla_expiry_reminders (entity, entity_id, expiry_date)
      values ('vehicle_insurance', r.id::text, r.insurance_expiry);
      v_count := v_count + 1;
    end if;

    if r.inspection_expiry is not null
       and r.inspection_expiry between current_date and current_date + v_days
       and not exists (select 1 from hericilla_expiry_reminders e
                       where e.entity = 'vehicle_inspection' and e.entity_id = r.id::text
                         and e.expiry_date = r.inspection_expiry) then
      perform hericilla_push_notification(null, 'logistics_officer', array['in_app','email']::hericilla_notification_channel[],
        'Vehicle inspection due',
        format('%s roadworthiness/inspection expires on %s. Book the inspection in time.', r.reg_no, r.inspection_expiry),
        jsonb_build_object('url', '/vehicles', 'entity', 'vehicle_inspection', 'entity_id', r.id, 'expiry_date', r.inspection_expiry));
      insert into hericilla_expiry_reminders (entity, entity_id, expiry_date)
      values ('vehicle_inspection', r.id::text, r.inspection_expiry);
      v_count := v_count + 1;
    end if;
  end loop;

  -- Supplier contracts / certificates
  for r in
    select sc.id, sc.expiry_date, s.name as supplier_name
    from hericilla_supplier_contracts sc
    join hericilla_suppliers s on s.id = sc.supplier_id
    where sc.expiry_date is not null
      and sc.expiry_date between current_date and current_date + v_days
  loop
    if not exists (select 1 from hericilla_expiry_reminders e
                   where e.entity = 'supplier_contract' and e.entity_id = r.id::text
                     and e.expiry_date = r.expiry_date) then
      perform hericilla_push_notification(null, 'procurement_officer', array['in_app','email']::hericilla_notification_channel[],
        'Supplier document expiring',
        format('A contract/certificate for supplier “%s” expires on %s. Request a valid copy.', left(r.supplier_name, 80), r.expiry_date),
        jsonb_build_object('url', '/suppliers', 'entity', 'supplier_contract', 'entity_id', r.id, 'expiry_date', r.expiry_date));
      insert into hericilla_expiry_reminders (entity, entity_id, expiry_date)
      values ('supplier_contract', r.id::text, r.expiry_date);
      v_count := v_count + 1;
    end if;
  end loop;

  -- Staff certifications
  for r in
    select c.id, c.expiry_date, p.id as person_id, p.full_name, c.name
    from hericilla_staff_certifications c
    join hericilla_profiles p on p.id = c.profile_id
    where c.expiry_date is not null
      and c.expiry_date between current_date and current_date + v_days
  loop
    if not exists (select 1 from hericilla_expiry_reminders e
                   where e.entity = 'staff_certification' and e.entity_id = r.id::text
                     and e.expiry_date = r.expiry_date) then
      perform hericilla_push_notification(r.person_id, 'hr_officer', array['in_app','email']::hericilla_notification_channel[],
        'Certification expiring',
        format('%s: your “%s” certification expires on %s. Speak with HR about renewal.', left(r.full_name, 60), left(r.name, 60), r.expiry_date),
        jsonb_build_object('url', '/profile', 'entity', 'staff_certification', 'entity_id', r.id, 'expiry_date', r.expiry_date));
      insert into hericilla_expiry_reminders (entity, entity_id, expiry_date)
      values ('staff_certification', r.id::text, r.expiry_date);
      v_count := v_count + 1;
    end if;
  end loop;

  -- Driver licences (profile row itself + fleet officer)
  for r in
    select p.id, p.full_name, p.license_expiry
    from hericilla_profiles p
    where p.role = 'driver' and p.status = 'active'
      and p.license_expiry between current_date and current_date + v_days
  loop
    if not exists (select 1 from hericilla_expiry_reminders e
                   where e.entity = 'driver_licence' and e.entity_id = r.id::text
                     and e.expiry_date = r.license_expiry) then
      perform hericilla_push_notification(r.id, 'logistics_officer', array['in_app','email']::hericilla_notification_channel[],
        'Driving licence expiring',
        format('%s, your driving licence expires on %s. Arrange renewal so you stay assignable to trips.', left(r.full_name, 60), r.license_expiry),
        jsonb_build_object('url', '/profile', 'entity', 'driver_licence', 'entity_id', r.id, 'expiry_date', r.license_expiry));
      insert into hericilla_expiry_reminders (entity, entity_id, expiry_date)
      values ('driver_licence', r.id::text, r.license_expiry);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;

-- Daily at 08:00 WAT (07:00 UTC). Skipped silently where pg_cron is absent.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     or exists (select 1 from pg_available_extensions where name = 'pg_cron'
                and installed_version is not null) then
    begin
      perform cron.unschedule('hericilla-expiry-reminders');
    exception when others then null;
    end;
    perform cron.schedule('hericilla-expiry-reminders', '0 7 * * *',
      'select public.hericilla_check_document_expiry(), public.hericilla_notify_upcoming_expiries()');
  end if;
exception when others then
  -- Local `supabase start` without pg_cron: run manually or via studio.
  raise notice 'pg_cron unavailable — expiry reminders must be triggered manually';
end $$;

comment on function public.hericilla_notify_upcoming_expiries() is
  'Daily expiry sweep: vehicle insurance/inspection, supplier contracts, staff certifications, driver licences → notification outbox (one reminder per expiry date, deduped by expiry_reminders). Documents are covered by hericilla_check_document_expiry() (0009).';
