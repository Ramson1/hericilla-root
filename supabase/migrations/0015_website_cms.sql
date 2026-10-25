-- 0015: Website CMS — blog/news, testimonials, careers, enquiries, page content, subscribers

create table if not exists hericilla_blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content_md text not null default '',
  cover_image text,
  category hericilla_blog_category not null default 'blog',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  published_at timestamptz,
  author_id uuid references hericilla_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hericilla_testimonials (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  company text,
  photo_url text,
  quote text not null,
  rating integer check (rating between 1 and 5),
  approved boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hericilla_careers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text,
  location text default 'Port Harcourt',
  description text,
  requirements text,
  closing_date date,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table if not exists hericilla_job_applications (
  id uuid primary key default gen_random_uuid(),
  career_id uuid references hericilla_careers(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  cv_url text,
  cover_letter text,
  status hericilla_job_app_status not null default 'new',
  reviewed_by uuid references hericilla_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists hericilla_enquiries (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default hericilla_next_ref('ENQ'),
  enquiry_type hericilla_enquiry_type not null default 'general',
  service_type hericilla_service_type,
  name text not null,
  company text,
  email text not null,
  phone text,
  message text not null,
  cargo_details text,
  pickup_location text,
  destination text,
  needed_by date,
  documents text[] not null default '{}',
  status hericilla_enquiry_status not null default 'new',
  assigned_to uuid references hericilla_profiles(id),
  converted_to_service_request_id uuid references hericilla_service_requests(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hericilla_service_requests add column if not exists enquiry_id uuid references hericilla_enquiries(id);

create table if not exists hericilla_page_content (
  key text primary key,                    -- e.g. 'home.hero_title', 'services.trucking.body'
  value jsonb not null,
  updated_by uuid references hericilla_profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists hericilla_newsletter_subscribers (
  email text primary key,
  subscribed_at timestamptz not null default now(),
  source text default 'website'
);

-- New website enquiry → notify admins (email + in-app)
create or replace function public.hericilla_notify_new_enquiry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into hericilla_notification_outbox (role_target, channels, title, body, data)
  values ('admin', array['email','in_app','web_push']::hericilla_notification_channel[],
          'New website enquiry: ' || new.ref_no,
          new.name || ' (' || coalesce(new.company,'—') || ') — ' || new.enquiry_type || '. View in Inbox.',
          jsonb_build_object('enquiry_id', new.id, 'kind', 'website_enquiry'));
  return new;
end $$;

drop trigger if exists trg_enquiry_notify on hericilla_enquiries;
create trigger trg_enquiry_notify
  after insert on hericilla_enquiries
  for each row execute function public.hericilla_notify_new_enquiry();

create index if not exists idx_blog_status on hericilla_blog_posts (status, published_at);
create index if not exists idx_enquiry_status on hericilla_enquiries (status);
create index if not exists idx_enquiry_ref on hericilla_enquiries (ref_no);
