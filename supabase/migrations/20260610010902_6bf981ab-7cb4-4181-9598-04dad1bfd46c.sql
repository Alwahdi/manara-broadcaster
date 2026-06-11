DROP POLICY IF EXISTS "releases public read" ON storage.objects;

CREATE POLICY "releases public read named files"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'releases'
  AND name = ANY (ARRAY[
    'latest.yml',
    'Manara-2.4.4-x64.zip',
    'Manara-2.4.3-x64.zip',
    'Manara-2.4.2-x64.zip',
    'Manara-2.4.1-x64.zip',
    'Manara-2.4.0-x64.zip'
  ])
);