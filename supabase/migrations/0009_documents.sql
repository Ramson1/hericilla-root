-- 0009: Contracts & document management with expiry tracking

create table if not exists hericilla_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  doc_type hericilla_doc_type not null,
  storage_bucket text not null default 'hericilla-documents',
  file_path text not null,                -- object path inside the bucket
  file_url text,                          -- public URL when bucket is public
  work_order_id uuid references hericilla_work_orders(id) on delete set null,
  client_id uuid references hericilla_clients(id) on delete set null,
  supplier_id uuid references hericilla_suppliers(id) on delete set null,
  transport_job_id uuid references hericilla_transport_jobs(id) on delete set null,
  packing_job_id uuid references hericilla_packing_jobs(id) on delete set null,
  purchase_order_id uuid references hericilla_purchase_orders(id) on delete set null,
  quotation_id uuid references hericilla_quotations(id) on delete set null,
  invoice_id uuid,                        -- FK added in 0010
  profile_id uuid references hericilla_profiles(id) on delete set null,   -- staff docs (licences etc.)
  sensitivity text not null default 'internal' check (sensitivity in ('public','internal','restricted')),
  expiry_date date,
  reminder_days integer default 30,
  status text not null default 'active' check (status in ('active','expired','archived')),
  uploaded_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nightly expiry sweep → flips status and queues notifications
create or replace function public.hericilla_check_document_expiry()
returns void language plpgsql security definer set search_path = public as $$
declare d hericilla_documents;
begin
  for d in select * from hericilla_documents
           where status = 'active' and expiry_date is not null
             and expiry_date <= current_date loop
    update hericilla_documents set status='expired' where id = d.id;
  end loop;
  for d in select * from hericilla_documents
           where status = 'active' and expiry_date is not null
             and expiry_date <= current_date + coalesce(reminder_days,30) loop
    insert into hericilla_notification_outbox (role_target, channels, title, body, data)
    select 'admin', array['email','in_app','web_push']::hericilla_notification_channel[],
           'Document expiring soon: ' || d.title,
           'Document "' || d.title || '" expires on ' || to_char(d.expiry_date,'DD Mon YYYY') || '.',
           jsonb_build_object('document_id', d.id, 'kind', 'document_expiry')
    where not exists (select 1 from hericilla_notification_outbox n
                      where n.data->>'document_id' = d.id::text
                        and n.created_at > now() - interval '7 days');
  end loop;
end $$;

create index if not exists idx_docs_type on hericilla_documents (doc_type);
create index if not exists idx_docs_wo on hericilla_documents (work_order_id);
create index if not exists idx_docs_expiry on hericilla_documents (expiry_date) where status = 'active';
