-- supabase/seed.sql — local development seed (runs with `supabase db reset` / `supabase db seed`)
-- Demo password for all seeded users: Hericilla#2026   (local/dev only — never production)

-- ── Departments (matches company org chart) ─────────────────────────────────
insert into hericilla_departments (name) values
  ('Procurement'), ('Logistics'), ('Warehouse'), ('Projects/Relocations'),
  ('Facilities'), ('Clients Service'), ('Finance'), ('Operations')
on conflict (name) do nothing;

-- ── Sites (Abuloma admin + operational bases from company profile) ──────────
insert into hericilla_sites (name, address, lat, lng, radius_m, kind) values
  ('Hericilla Admin — Abuloma', 'Abuloma, Port Harcourt, Rivers State', 4.7830, 7.0070, 300, 'office'),
  ('Hericilla Operational Base', '226 Abuloma Road, Abuloma, Port Harcourt', 4.7830, 7.0070, 400, 'operational')
on conflict do nothing;

-- ── Shifts ────────────────────────────────────────────────────────────────────
insert into hericilla_shifts (name, start_time, end_time, break_mins) values
  ('Day Shift',      '08:00', '17:00', 60),
  ('Morning',        '06:00', '14:00', 30),
  ('Late Shift',     '12:00', '20:00', 30),
  ('Night Watch',    '20:00', '06:00', 45)
on conflict do nothing;

-- ── Inspection checklists ─────────────────────────────────────────────────────
insert into hericilla_inspection_checklists (name, trip_phase, items) values
  ('Pre-Trip Standard', 'pre',
   '["Tyre pressure & condition","Lights & indicators","Brakes","Engine oil level","Coolant","Fuel level","Body & load box","Horn","Seat belts","Fire extinguisher on board"]'),
  ('Post-Trip Standard', 'post',
   '["New dents or damage","Tyre condition","Fluid leaks","Load secured / emptied","Odometer reading","Cleanliness"]')
on conflict do nothing;

-- ── Demo users ───────────────────────────────────────────────────────────────
do $$
declare
  u_admin uuid; u_super uuid; u_proc uuid; u_staff uuid; u_driver uuid; u_fin uuid;
begin
  create extension if not exists pgcrypto;

  -- Demo users: instance_id is a uuid column (nullable) — GoTrue leaves it null for single-instance
  -- projects, so seed them the same way; the 'exact' placeholder that was here aborted with 22P02.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (null, gen_random_uuid(), 'authenticated', 'authenticated', 'admin@hericilla.test',
     crypt('Hericilla#2026', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Ada Testa"}', now(), now())
  returning id into u_admin;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (null, gen_random_uuid(), 'authenticated', 'authenticated', 'supervisor@hericilla.test',
     crypt('Hericilla#2026', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Segun Supervisor"}', now(), now())
  returning id into u_super;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (null, gen_random_uuid(), 'authenticated', 'authenticated', 'procurement@hericilla.test',
     crypt('Hericilla#2026', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Priya Procurement"}', now(), now())
  returning id into u_proc;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (null, gen_random_uuid(), 'authenticated', 'authenticated', 'staff@hericilla.test',
     crypt('Hericilla#2026', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Tunde Warehouse"}', now(), now())
  returning id into u_staff;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (null, gen_random_uuid(), 'authenticated', 'authenticated', 'driver@hericilla.test',
     crypt('Hericilla#2026', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Musa Driver"}', now(), now())
  returning id into u_driver;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (null, gen_random_uuid(), 'authenticated', 'authenticated', 'finance@hericilla.test',
     crypt('Hericilla#2026', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Funke Finance"}', now(), now())
  returning id into u_fin;

  update hericilla_profiles set role = 'super_admin',        employee_no = 'HCS-0001', home_base = 'Abuloma, PH'          where id = u_admin;
  update hericilla_profiles set role = 'supervisor',         employee_no = 'HCS-0002', home_base = 'Trans-Amadi, PH',
        department_id = (select id from hericilla_departments where name = 'Operations')                                   where id = u_super;
  update hericilla_profiles set role = 'procurement_officer',employee_no = 'HCS-0003',
        department_id = (select id from hericilla_departments where name = 'Procurement')                                  where id = u_proc;
  update hericilla_profiles set role = 'warehouse_agent',    employee_no = 'HCS-0004',
        department_id = (select id from hericilla_departments where name = 'Warehouse')                                    where id = u_staff;
  update hericilla_profiles set role = 'driver',             employee_no = 'HCS-0005', home_base = 'Trans-Amadi, PH',
        license_number = 'PH-2381-RC', license_expiry = current_date + interval '3 years'                        where id = u_driver;
  update hericilla_profiles set role = 'finance_officer',    employee_no = 'HCS-0006',
        department_id = (select id from hericilla_departments where name = 'Finance')                                      where id = u_fin;
end $$;

-- ── Website CMS content ──────────────────────────────────────────────────────
insert into hericilla_blog_posts (slug, title, excerpt, content_md, category, tags, status, published_at) values
  ('fleet-upgrade-2026', 'Hericilla Expands Heavy Fleet with New Low-Bed Trailers',
   'Four new 40ft low-bed trailers join our fleet to serve the growing demand from E&P operators in the Niger Delta.',
   E'## New capacity for oversized cargo\n\nHericilla Support Services has inducted four 40ft low-bed trailers into its fleet, increasing capacity for heavy equipment movements to Trans-Amadi and offshore bases.\n\nThe new units support our crane-and-transport combinations used by drilling and subsea clients.\n\n* Max payload: 45 tons\n* Route coverage: Port Harcourt, Aba, Warri, Onne\n* Operators: SEN-certified drivers',
   'news', '{fleet,logistics}', 'published', now()),
  ('safety-first', 'Why We Clock Out Safely: A Note from Our HSEQ Desk',
   'A short look at the trip-management discipline that keeps our 0 lost-time-injury record intact.',
   E'## Rest, route, review\n\nEvery long-haul trip is planned with mandated rest stops and pre/post-trip inspections. Our drivers log odometer readings and inspection results from the mobile app before a wheel turns.\n\nSafety is not a slogan here — it is a checklist.',
   'blog', '{safety,hseq}', 'published', now())
on conflict (slug) do nothing;

insert into hericilla_testimonials (client_name, company, quote, rating, approved, display_order) values
  ('Operations Manager', 'AOS Orwell', 'Hericilla has moved our rigs'' critical cargo without a single delayed delivery. Their documentation is impeccable.', 5, true, 1),
  ('Logistics Lead', 'Best Land & Sea Resources', 'Their crane-and-transport combination saved us a week of offshore waiting time.', 5, true, 2),
  ('Project Coordinator', 'Geoplex DrillTeq', 'Professional drivers, transparent trip reports, and PODs the same day. Highly recommended.', 4, true, 3),
  ('Procurement Officer', 'Titan Tubulars', 'Materials arrive on-spec and on-time. Hericilla has become our default haulage partner in PH.', 5, true, 4)
on conflict do nothing;

insert into hericilla_careers (title, department, location, closing_date, status) values
  ('Heavy-Duty Truck Driver', 'Logistics', 'Port Harcourt', current_date + 45, 'open'),
  ('Warehouse Attendant', 'Warehouse', 'Trans-Amadi', current_date + 30, 'open')
on conflict do nothing;

insert into hericilla_page_content (key, value) values
  ('home.hero_title',    '"Moving cargo, sourcing equipment, supporting Nigeria''s energy sector."'::jsonb),
  ('home.hero_subtitle', '"Hericilla Support Services Limited — integrated logistics, procurement and supply-chain support since 2020."'::jsonb),
  ('contact.admin_address', '"No 234, Abuloma Road, Abuloma — Port Harcourt, Rivers State"'::jsonb),
  ('contact.ops_address',   '"226 Abuloma Road, Abuloma — Port Harcourt, Rivers State"'::jsonb),
  ('contact.phone1', '"+234 802 309 1220"'::jsonb),
  ('contact.phone2', '"+234 803 403 6596"'::jsonb),
  ('contact.email', '"hericillasurportservices@gmail.com"'::jsonb)
on conflict (key) do nothing;

-- ── Demo fleet & inventory ───────────────────────────────────────────────────
insert into hericilla_vehicles (reg_no, make, model, vehicle_type, capacity, status) values
  ('PH-4821XL', 'MAN', 'TGS 6x4', 'flat_bed', '40ft / 45 tons', 'available'),
  ('PH-1902KR', 'Toyota', 'DYCR Crane', 'crane', '16 ton crane', 'available'),
  ('PH-7734VN', 'Mercedes', 'Sprinter', 'van', '1.5 tons', 'available'),
  ('PH-5580FL', 'Howo', 'Sinotruk 8x4', 'truck', '25 tons', 'maintenance')
on conflict (reg_no) do nothing;

insert into hericilla_inventory_categories (name) values
  ('Packing Materials'), ('Safety Equipment'), ('Tools'), ('Vehicle Parts')
on conflict (name) do nothing;

insert into hericilla_inventory_items (sku, name, uom, min_stock_level, reorder_qty, unit_value, location, category_id) values
  ('PK-CART-LG', 'Heavy-duty carton (large)', 'pcs', 100, 300, 850, 'Trans-Amadi Store', (select id from hericilla_inventory_categories where name = 'Packing Materials')),
  ('PK-STRETCH', 'Stretch wrap 500mm', 'roll', 40, 100, 4200, 'Trans-Amadi Store', (select id from hericilla_inventory_categories where name = 'Packing Materials')),
  ('SF-HELMET',  'Safety helmet (ANSI)', 'pcs', 25, 50, 3500, 'Trans-Amadi Store', (select id from hericilla_inventory_categories where name = 'Safety Equipment')),
  ('SF-BOOTS',   'Steel-toe boots', 'pair', 20, 40, 12000, 'Trans-Amadi Store', (select id from hericilla_inventory_categories where name = 'Safety Equipment'))
on conflict (sku) do nothing;

-- Initial stock so the dashboard isn't empty
insert into hericilla_stock_movements (item_id, movement_type, quantity, to_location, note, actor_id)
select i.id, 'received', 200, 'Trans-Amadi Store', 'Opening balance (seed)',
       (select id from hericilla_profiles where role = 'super_admin' limit 1)
from hericilla_inventory_items i;

-- ── A demo client + service request so the admin portal has data ─────────────
insert into hericilla_clients (name, email, phone, address) values
  ('Demo Energy Ltd', 'ops@demoenergy.test', '08000000000', 'Port Harcourt')
on conflict do nothing;
