-- 0021: Public enquiry status lookup (limited fields, no personal data beyond name)
create or replace function public.get_enquiry_status(p_ref text)
returns table (ref_no text, status text, created_at timestamptz, updated_summary text)
language sql stable security definer set search_path = public as $$
  select e.ref_no, e.status::text, e.created_at,
         case e.status
           when 'new' then 'Received — an officer will respond within 24 hours.'
           when 'assigned' then 'Assigned to ' || coalesce(p.full_name, 'an officer') || '.'
           when 'in_progress' then 'Our team is working on your request.'
           when 'responded' then 'We have responded by email. Please check your inbox.'
           when 'closed' then 'This enquiry is closed. Contact us any time again.'
           else 'In progress.'
         end as updated_summary
  from enquiries e
  left join profiles p on p.id = e.assigned_to
  where upper(e.ref_no) = upper(trim(p_ref));
$$;

grant execute on function public.get_enquiry_status(text) to anon, authenticated;
