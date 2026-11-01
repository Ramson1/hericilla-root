-- 0026_pipeline_gaps.sql — job application attachments + audit coverage for website intake.
-- Idempotent; run in Supabase Dashboard SQL Editor (select all statements).

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Job applications: multiple attachments (docx/pdf/images) alongside legacy cv_url
-- ──────────────────────────────────────────────────────────────────────────────
alter table hericilla_job_applications
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Extend audit triggers to the website intake tables
--    (reuses public.hericilla_write_audit from 0017_notifications.sql)
-- ──────────────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array[
    'hericilla_enquiries','hericilla_job_applications'
  ] loop
    execute format('drop trigger if exists trg_audit_%I on %I', t, t);
    execute format(
      'create trigger trg_audit_%I after insert or update or delete on %I
       for each row execute function public.hericilla_write_audit()', t, t);
  end loop;
end $$;
