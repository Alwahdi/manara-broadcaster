insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tera-downloads',
  'tera-downloads',
  true,
  250000000,
  array['application/zip', 'application/gzip', 'application/x-gzip', 'application/octet-stream']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can download Tera broadcaster files'
  ) then
    create policy "Public can download Tera broadcaster files"
    on storage.objects
    for select
    to public
    using (bucket_id = 'tera-downloads');
  end if;
end $$;