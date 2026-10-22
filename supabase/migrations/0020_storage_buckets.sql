-- 0020: Storage buckets + object policies
-- public-assets: public read (website images). Everything else private, role-gated.

insert into storage.buckets (id, name, public) values
  ('public-assets',    'public-assets',    true),
  ('enquiry-uploads',  'enquiry-uploads',  false),
  ('documents',        'documents',        false),
  ('pod-evidence',     'pod-evidence',     false),
  ('receipts',         'receipts',         false)
on conflict (id) do nothing;

-- Public reads for website assets
drop policy if exists "public-assets read" on storage.objects;
create policy "public-assets read" on storage.objects for select
  using (bucket_id = 'public-assets');

-- Authenticated users may upload into working buckets (own folder = auth.uid())
drop policy if exists "auth upload private" on storage.objects;
create policy "auth upload private" on storage.objects for insert to authenticated
  with check (bucket_id in ('enquiry-uploads','documents','pod-evidence','receipts')
              and (storage.foldername(name))[1] = auth.uid()::text);

-- Ops roles may upload anywhere (admin portal has shared folders)
drop policy if exists "ops upload private" on storage.objects;
create policy "ops upload private" on storage.objects for insert to authenticated
  with check (bucket_id in ('enquiry-uploads','documents','pod-evidence','receipts')
              and public.is_ops());

-- Read your own uploads
drop policy if exists "own files read" on storage.objects;
create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id in ('enquiry-uploads','documents','pod-evidence','receipts')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Ops/finance read evidence & documents; drivers read POD/receipts for own jobs
drop policy if exists "ops read private" on storage.objects;
create policy "ops read private" on storage.objects for select to authenticated
  using (bucket_id in ('documents','pod-evidence','receipts','enquiry-uploads') and public.is_ops());

drop policy if exists "driver read evidence" on storage.objects;
create policy "driver read evidence" on storage.objects for select to authenticated
  using (bucket_id in ('pod-evidence','receipts') and public.is_driver()
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Updates/deletes: ops only (soft handling via documents.status otherwise)
drop policy if exists "ops manage files" on storage.objects;
create policy "ops manage files" on storage.objects for update to authenticated
  using (bucket_id <> 'public-assets' and public.is_ops());

drop policy if exists "admin delete files" on storage.objects;
create policy "admin delete files" on storage.objects for delete to authenticated
  using (bucket_id <> 'public-assets' and public.is_admin());
