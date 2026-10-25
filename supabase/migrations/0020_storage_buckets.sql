-- 0020: Storage buckets + object policies
-- public-assets: public read (website images). Everything else private, role-gated.

insert into storage.buckets (id, name, public) values
  ('hericilla-public-assets',    'hericilla-public-assets',    true),
  ('hericilla-enquiry-uploads',  'hericilla-enquiry-uploads',  false),
  ('hericilla-documents',        'hericilla-documents',        false),
  ('hericilla-pod-evidence',     'hericilla-pod-evidence',     false),
  ('hericilla-receipts',         'hericilla-receipts',         false)
on conflict (id) do nothing;

-- Public reads for website assets
drop policy if exists "hericilla-public-assets read" on storage.objects;
create policy "hericilla-public-assets read" on storage.objects for select
  using (bucket_id = 'hericilla-public-assets');

-- Authenticated users may upload into working buckets (own folder = auth.uid())
drop policy if exists "auth upload private" on storage.objects;
create policy "auth upload private" on storage.objects for insert to authenticated
  with check (bucket_id in ('hericilla-enquiry-uploads','hericilla-documents','hericilla-pod-evidence','hericilla-receipts')
              and (storage.foldername(name))[1] = auth.uid()::text);

-- Ops roles may upload anywhere (admin portal has shared folders)
drop policy if exists "ops upload private" on storage.objects;
create policy "ops upload private" on storage.objects for insert to authenticated
  with check (bucket_id in ('hericilla-enquiry-uploads','hericilla-documents','hericilla-pod-evidence','hericilla-receipts')
              and public.hericilla_is_ops());

-- Read your own uploads
drop policy if exists "own files read" on storage.objects;
create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id in ('hericilla-enquiry-uploads','hericilla-documents','hericilla-pod-evidence','hericilla-receipts')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Ops/finance read evidence & documents; drivers read POD/receipts for own jobs
drop policy if exists "ops read private" on storage.objects;
create policy "ops read private" on storage.objects for select to authenticated
  using (bucket_id in ('hericilla-documents','hericilla-pod-evidence','hericilla-receipts','hericilla-enquiry-uploads') and public.hericilla_is_ops());

drop policy if exists "driver read evidence" on storage.objects;
create policy "driver read evidence" on storage.objects for select to authenticated
  using (bucket_id in ('hericilla-pod-evidence','hericilla-receipts') and public.hericilla_is_driver()
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Updates/deletes: ops only (soft handling via hericilla_documents.status otherwise)
drop policy if exists "ops manage files" on storage.objects;
create policy "ops manage files" on storage.objects for update to authenticated
  using (bucket_id <> 'hericilla-public-assets' and public.hericilla_is_ops());

drop policy if exists "admin delete files" on storage.objects;
create policy "admin delete files" on storage.objects for delete to authenticated
  using (bucket_id <> 'hericilla-public-assets' and public.hericilla_is_admin());
