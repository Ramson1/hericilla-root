-- 0022: RLS gaps found while building the Phase-1 admin portal.
-- 1) CMS + enquiry tables only had public-read policies — admins could not write.
-- 2) The feedback insert policy referenced a non-existent created_by column
--    (request_feedback stores raised_by text / handled_by uuid).

-- ──────────────────────────────────────────────────────────────────────────────
-- Website CMS: admin roles manage content; auditors may read everything.
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists blog_admin_write on blog_posts;
create policy blog_admin_write on blog_posts for all
  using (public.has_role('super_admin','admin','supervisor','hr_officer'))
  with check (public.has_role('super_admin','admin','supervisor','hr_officer'));

drop policy if exists testimonials_admin_rw on testimonials;
create policy testimonials_admin_rw on testimonials for all
  using (public.has_role('super_admin','admin','supervisor','hr_officer'))
  with check (public.has_role('super_admin','admin','supervisor','hr_officer'));

drop policy if exists careers_admin_write on careers;
create policy careers_admin_write on careers for all
  using (public.has_role('super_admin','admin','hr_officer'))
  with check (public.has_role('super_admin','admin','hr_officer'));

-- Admins see draft/scheduled posts and unapproved testimonials too:
drop policy if exists blog_admin_read_all on blog_posts;
create policy blog_admin_read_all on blog_posts for select
  using (public.has_role('super_admin','admin','supervisor','hr_officer','auditor')
         or status = 'published');

drop policy if exists testimonials_admin_read_all on testimonials;
create policy testimonials_admin_read_all on testimonials for select
  using (public.has_role('super_admin','admin','supervisor','hr_officer','auditor')
         or approved = true);

drop policy if exists page_content_admin_write on page_content;
create policy page_content_admin_write on page_content for all
  using (public.is_ops()) with check (public.is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- Enquiries inbox: ops roles work the queue (anon inserts stay service-role only).
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists enquiries_admin_read on enquiries;
create policy enquiries_admin_read on enquiries for select
  using (public.is_ops());

drop policy if exists enquiries_admin_write on enquiries;
create policy enquiries_admin_write on enquiries for update
  using (public.is_ops()) with check (public.is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- Chat threads: agents (admin/supervisor) see the full list of threads.
-- (0018 only let a visitor see their own thread by token or is_admin().)
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists chat_thread_agent_read on chat_threads;
create policy chat_thread_agent_read on chat_threads for select
  using (public.has_role('super_admin','admin','supervisor','staff')
         or visitor_token::text = coalesce(current_setting('request.headers', true)::json->>'x-visitor-token',''));

-- ──────────────────────────────────────────────────────────────────────────────
-- Feedback: any authenticated user may raise it (clients phoned-in etc.);
-- only ops can mark it handled. Replace the broken policy from 0018.
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists feedback_insert on request_feedback;
create policy feedback_insert on request_feedback for insert to authenticated
  with check (true);

drop policy if exists feedback_update on request_feedback;
create policy feedback_update on request_feedback for update
  using (public.is_ops()) with check (public.is_ops());
