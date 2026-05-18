-- IMPORTANT: Run this entire script in the Supabase SQL editor before testing the Delete button.
-- Dashboard → SQL Editor → paste and run.

-- 1. Extend the status check constraint to allow 'deleted'
alter table toolbox_talks drop constraint if exists toolbox_talks_status_check;
alter table toolbox_talks add constraint toolbox_talks_status_check
  check (status in ('active', 'archived', 'deleted'));

-- 2. RLS policy: allow appointed_person and crane_supervisor to UPDATE talks on their site
drop policy if exists "AP and supervisor can update site talks" on toolbox_talks;
create policy "AP and supervisor can update site talks"
  on toolbox_talks for update
  to authenticated
  using (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  )
  with check (
    site_id = (select site_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('appointed_person', 'crane_supervisor')
  );
