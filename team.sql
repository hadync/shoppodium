-- ═══ TEAM LAYER: installers under a shop, locations on a profile ═══════
alter table public.profiles add column if not exists parent_shop_id uuid references public.profiles(id);
alter table public.profiles add column if not exists role text default 'owner';
alter table public.profiles add column if not exists team_code text;
alter table public.profiles add column if not exists locations jsonb;
create index if not exists idx_profiles_parent on public.profiles(parent_shop_id);
create index if not exists idx_profiles_teamcode on public.profiles(team_code);
update public.profiles set team_code = substr(md5(id::text || 'sp'), 1, 6) where team_code is null;

-- ═══ V2: the location dimension ═══════════════════════════════════════
alter table public.jobs add column if not exists location text;
alter table public.booking_requests add column if not exists location text;
alter table public.booking_requests add column if not exists car_year text;
