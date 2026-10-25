-- 0022: RLS gaps found while building the Phase-1 admin portal.
-- 1) CMS + enquiry tables only had public-read policies — admins could not write.
-- 2) Feedback had no UPDATE policy — ops could not mark items handled.

-- ──────────────────────────────────────────────────────────────────────────────
-- Website CMS: admin roles manage content; auditors may read everything.
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists blog_admin_write on hericilla_blog_posts;
create policy blog_admin_write on hericilla_blog_posts for all
  using (public.hericilla_has_role('super_admin','admin','supervisor','hr_officer'))
  with check (public.hericilla_has_role('super_admin','admin','supervisor','hr_officer'));

drop policy if exists testimonials_admin_rw on hericilla_testimonials;
create policy testimonials_admin_rw on hericilla_testimonials for all
  using (public.hericilla_has_role('super_admin','admin','supervisor','hr_officer'))
  with check (public.hericilla_has_role('super_admin','admin','supervisor','hr_officer'));

drop policy if exists careers_admin_write on hericilla_careers;
create policy careers_admin_write on hericilla_careers for all
  using (public.hericilla_has_role('super_admin','admin','hr_officer'))
  with check (public.hericilla_has_role('super_admin','admin','hr_officer'));

-- Admins see draft/scheduled posts and unapproved testimonials too:
drop policy if exists blog_admin_read_all on hericilla_blog_posts;
create policy blog_admin_read_all on hericilla_blog_posts for select
  using (public.hericilla_has_role('super_admin','admin','supervisor','hr_officer','auditor')
         or status = 'published');

drop policy if exists testimonials_admin_read_all on hericilla_testimonials;
create policy testimonials_admin_read_all on hericilla_testimonials for select
  using (public.hericilla_has_role('super_admin','admin','supervisor','hr_officer','auditor')
         or approved = true);

drop policy if exists page_content_admin_write on hericilla_page_content;
create policy page_content_admin_write on hericilla_page_content for all
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- Enquiries inbox: ops roles work the queue (anon inserts stay service-role only).
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists enquiries_admin_read on hericilla_enquiries;
create policy enquiries_admin_read on hericilla_enquiries for select
  using (public.hericilla_is_ops());

drop policy if exists enquiries_admin_write on hericilla_enquiries;
create policy enquiries_admin_write on hericilla_enquiries for update
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());

-- ──────────────────────────────────────────────────────────────────────────────
-- Chat threads: agents (admin/supervisor) see the full list of threads.
-- (0018 only let a visitor see their own thread by token or hericilla_is_admin().)
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists chat_thread_agent_read on hericilla_chat_threads;
create policy chat_thread_agent_read on hericilla_chat_threads for select
  using (public.hericilla_has_role('super_admin','admin','supervisor','staff')
         or visitor_token::text = coalesce(current_setting('request.headers', true)::json->>'x-visitor-token',''));

-- ──────────────────────────────────────────────────────────────────────────────
-- Feedback: 0018 lets any authenticated user raise it; here only ops may mark it handled.
-- ──────────────────────────────────────────────────────────────────────────────
drop policy if exists feedback_update on hericilla_request_feedback;
create policy feedback_update on hericilla_request_feedback for update
  using (public.hericilla_is_ops()) with check (public.hericilla_is_ops());
