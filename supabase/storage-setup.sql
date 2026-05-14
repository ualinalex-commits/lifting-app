-- Run this in Supabase Dashboard > SQL Editor
-- Creates the two required Storage buckets for Toolbox Talk

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('toolbox-talk-pdfs', 'toolbox-talk-pdfs', false, 52428800,
   array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('toolbox-talk-signatures', 'toolbox-talk-signatures', false, 5242880,
   array['image/png','image/jpeg'])
on conflict (id) do nothing;

-- RLS policy: authenticated users can upload to their company folder
create policy "Authenticated users can upload toolbox talk files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'toolbox-talk-pdfs');

create policy "Authenticated users can read toolbox talk files"
on storage.objects for select
to authenticated
using (bucket_id = 'toolbox-talk-pdfs');

create policy "Authenticated users can upload signatures"
on storage.objects for insert
to authenticated
with check (bucket_id = 'toolbox-talk-signatures');

create policy "Authenticated users can read signatures"
on storage.objects for select
to authenticated
using (bucket_id = 'toolbox-talk-signatures');
