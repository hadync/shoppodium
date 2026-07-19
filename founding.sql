-- ═══ FOUNDING SHOPS: first 25 stay free forever ═══════════════════════

alter table public.profiles add column if not exists founding_member boolean default false;
alter table public.profiles add column if not exists founding_number int;

-- backfill: everyone already here, in arrival order, capped at 25
with ranked as (
  select id, row_number() over (order by created_at asc) as rn
  from public.profiles
)
update public.profiles p
set founding_member = true, founding_number = r.rn
from ranked r
where p.id = r.id and r.rn <= 25 and p.founding_member is not true;

-- every future claim: automatic while seats remain, race-safe
create or replace function public.assign_founding_seat()
returns trigger as $$
declare seats_taken int;
begin
  lock table public.profiles in share row exclusive mode;
  select count(*) into seats_taken from public.profiles where founding_member = true;
  if seats_taken < 25 then
    new.founding_member := true;
    new.founding_number := seats_taken + 1;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_founding_seat on public.profiles;
create trigger trg_founding_seat
before insert on public.profiles
for each row execute function public.assign_founding_seat();
