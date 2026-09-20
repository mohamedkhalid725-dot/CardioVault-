-- CardioVault private clinical media storage for Supabase.
-- Run this in the Supabase SQL Editor after creating the Supabase project.
-- The bucket is PRIVATE: images are never exposed through public URLs.
-- Firebase Auth remains the application's identity provider.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-media',
  'clinical-media',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/heic','image/heif']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

-- Re-runnable policy setup.
drop policy if exists "CardioVault Firebase users can upload clinical images" on storage.objects;
drop policy if exists "CardioVault users can read their own clinical images" on storage.objects;
drop policy if exists "CardioVault users can update their own clinical images" on storage.objects;
drop policy if exists "CardioVault users can delete their own clinical images" on storage.objects;

-- Only accept Firebase JWTs issued for CardioVault's Firebase project.
-- Storage assigns owner_id from the JWT sub claim when an object is created.
-- SELECT/DELETE/UPDATE are then restricted to that same Firebase user.
create policy "CardioVault Firebase users can upload clinical images"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'clinical-media'
  and (select auth.jwt()->>'iss') = 'https://securetoken.google.com/ccu-notebook'
  and (select auth.jwt()->>'aud') = 'ccu-notebook'
);

create policy "CardioVault users can read their own clinical images"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'clinical-media'
  and owner_id = (select auth.jwt()->>'sub')
  and (select auth.jwt()->>'iss') = 'https://securetoken.google.com/ccu-notebook'
  and (select auth.jwt()->>'aud') = 'ccu-notebook'
);

create policy "CardioVault users can update their own clinical images"
on storage.objects
for update
to anon, authenticated
using (
  bucket_id = 'clinical-media'
  and owner_id = (select auth.jwt()->>'sub')
  and (select auth.jwt()->>'iss') = 'https://securetoken.google.com/ccu-notebook'
  and (select auth.jwt()->>'aud') = 'ccu-notebook'
)
with check (
  bucket_id = 'clinical-media'
  and owner_id = (select auth.jwt()->>'sub')
  and (select auth.jwt()->>'iss') = 'https://securetoken.google.com/ccu-notebook'
  and (select auth.jwt()->>'aud') = 'ccu-notebook'
);

create policy "CardioVault users can delete their own clinical images"
on storage.objects
for delete
to anon, authenticated
using (
  bucket_id = 'clinical-media'
  and owner_id = (select auth.jwt()->>'sub')
  and (select auth.jwt()->>'iss') = 'https://securetoken.google.com/ccu-notebook'
  and (select auth.jwt()->>'aud') = 'ccu-notebook'
);
