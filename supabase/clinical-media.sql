-- CardioVault private clinical media + Unit access control for Supabase.
-- Run this entire file once in the Supabase SQL Editor.
create extension if not exists pgcrypto;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('clinical-media','clinical-media',false,10485760,array['image/jpeg','image/png','image/webp','image/gif','image/bmp','image.heic','image.heif']::text[])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.cardio_unit_access_codes(
 code_hash text primary key,unit_id text not null,unit_name text not null,
 role text not null default 'clinical_editor' check(role in('view_only','clinical_editor')),
 active boolean not null default true,created_at timestamptz not null default now(),revoked_at timestamptz);
create table if not exists public.cardio_unit_memberships(
 firebase_uid text not null,unit_id text not null,unit_name text not null,
 role text not null default 'clinical_editor' check(role in('view_only','clinical_editor')),
 active boolean not null default true,joined_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(firebase_uid,unit_id));
alter table public.cardio_unit_access_codes enable row level security;
alter table public.cardio_unit_memberships enable row level security;

create or replace function public.cardio_valid_firebase_jwt() returns boolean language sql stable as $$
 select (auth.jwt()->>'iss')='https://securetoken.google.com/ccu-notebook'
 and (auth.jwt()->>'aud')='ccu-notebook' and coalesce(auth.jwt()->>'sub','')<>'';
$$;
create or replace function public.cardio_is_master() returns boolean language sql stable as $
 select public.cardio_valid_firebase_jwt() and lower(coalesce(auth.jwt()->>'email',''))='mohamedkhalid725@gmail.com';
$;
create or replace function public.cardio_is_unit_member(p_unit_id text) returns boolean
language sql stable security definer set search_path=public,extensions as $
 select public.cardio_valid_firebase_jwt()
 and exists(
   select 1 from public.cardio_unit_memberships m
   where m.firebase_uid=auth.jwt()->>'sub'
     and m.unit_id=p_unit_id
     and m.active=true
 );
$;
revoke all on function public.cardio_is_unit_member(text) from public;
grant execute on function public.cardio_is_unit_member(text) to anon,authenticated;


create or replace function public.cardio_register_access_code(p_code text,p_unit_id text,p_unit_name text,p_role text default 'clinical_editor')
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare v_hash text;
begin
 if not public.cardio_is_master() then raise exception 'Only the CardioVault Master Account can register Unit Access Codes.'; end if;
 if coalesce(trim(p_code),'')='' or coalesce(trim(p_unit_id),'')='' then raise exception 'Access code and Unit ID are required.'; end if;
 if p_role not in('view_only','clinical_editor') then raise exception 'Invalid Unit role.'; end if;
 v_hash:=encode(digest(upper(trim(p_code)),'sha256'),'hex');
 insert into public.cardio_unit_access_codes(code_hash,unit_id,unit_name,role,active,revoked_at)
 values(v_hash,trim(p_unit_id),trim(p_unit_name),p_role,true,null)
 on conflict(code_hash) do update set unit_id=excluded.unit_id,unit_name=excluded.unit_name,role=excluded.role,active=true,revoked_at=null;
 return true;
end; $$;

create or replace function public.cardio_revoke_access_code(p_code text)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
begin
 if not public.cardio_is_master() then raise exception 'Only the CardioVault Master Account can revoke Unit Access Codes.'; end if;
 update public.cardio_unit_access_codes set active=false,revoked_at=now()
 where code_hash=encode(digest(upper(trim(p_code)),'sha256'),'hex');
 return true;
end; $$;

create or replace function public.cardio_redeem_access_code(p_code text)
returns table(unit_id text,unit_name text,role text)
language plpgsql security definer set search_path=public,extensions as $$
declare v_code public.cardio_unit_access_codes%rowtype;
begin
 if not public.cardio_valid_firebase_jwt() then raise exception 'Valid CardioVault Firebase authentication is required.'; end if;
 select * into v_code from public.cardio_unit_access_codes
 where code_hash=encode(digest(upper(trim(p_code)),'sha256'),'hex') and active=true limit 1;
 if not found then raise exception 'Invalid or inactive Unit Access Code.'; end if;
 insert into public.cardio_unit_memberships(firebase_uid,unit_id,unit_name,role,active,joined_at,updated_at)
 values(auth.jwt()->>'sub',v_code.unit_id,v_code.unit_name,v_code.role,true,now(),now())
 on conflict(firebase_uid,unit_id) do update set unit_name=excluded.unit_name,role=excluded.role,active=true,updated_at=now();
 return query select v_code.unit_id,v_code.unit_name,v_code.role;
end; $$;
grant execute on function public.cardio_register_access_code(text,text,text,text) to anon,authenticated;
grant execute on function public.cardio_revoke_access_code(text) to anon,authenticated;
grant execute on function public.cardio_redeem_access_code(text) to anon,authenticated;

drop policy if exists "CardioVault Firebase users can upload clinical images" on storage.objects;
drop policy if exists "CardioVault users can read their own clinical images" on storage.objects;
drop policy if exists "CardioVault users can update their own clinical images" on storage.objects;
drop policy if exists "CardioVault users can delete their own clinical images" on storage.objects;
drop policy if exists "CardioVault unit members can upload clinical images" on storage.objects;
drop policy if exists "CardioVault unit members can read clinical images" on storage.objects;
drop policy if exists "CardioVault unit members can update clinical images" on storage.objects;
drop policy if exists "CardioVault unit members can delete clinical images" on storage.objects;

create policy "CardioVault unit members can upload clinical images" on storage.objects for insert to anon,authenticated with check(
 bucket_id='clinical-media' and public.cardio_valid_firebase_jwt() and
 (public.cardio_is_master() or public.cardio_is_unit_member(split_part(name,'/',2))));
create policy "CardioVault unit members can read clinical images" on storage.objects for select to anon,authenticated using(
 bucket_id='clinical-media' and public.cardio_valid_firebase_jwt() and
 (public.cardio_is_master() or public.cardio_is_unit_member(split_part(name,'/',2))));
create policy "CardioVault unit members can update clinical images" on storage.objects for update to anon,authenticated using(
 bucket_id='clinical-media' and public.cardio_valid_firebase_jwt() and
 (public.cardio_is_master() or public.cardio_is_unit_member(split_part(name,'/',2))))
with check(
 bucket_id='clinical-media' and public.cardio_valid_firebase_jwt() and
 (public.cardio_is_master() or public.cardio_is_unit_member(split_part(name,'/',2))));
create policy "CardioVault unit members can delete clinical images" on storage.objects for delete to anon,authenticated using(
 bucket_id='clinical-media' and public.cardio_valid_firebase_jwt() and
 (public.cardio_is_master() or public.cardio_is_unit_member(split_part(name,'/',2))));

drop policy if exists "CardioVault deny direct access code reads" on public.cardio_unit_access_codes;
drop policy if exists "CardioVault deny direct membership reads" on public.cardio_unit_memberships;
create policy "CardioVault deny direct access code reads" on public.cardio_unit_access_codes for select to anon,authenticated using(false);
create policy "CardioVault deny direct membership reads" on public.cardio_unit_memberships for select to anon,authenticated using(false);
