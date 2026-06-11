drop policy if exists "Public can download Tera broadcaster files" on storage.objects;

create policy "Public can download Tera broadcaster release files"
on storage.objects
for select
to public
using (
  bucket_id = 'tera-downloads'
  and name in (
    'TeraNet-Broadcaster-win-x64.zip',
    'TeraNet-Broadcaster-linux-x64.tar.gz'
  )
);