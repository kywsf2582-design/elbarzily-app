-- Staging-only Supabase Storage hardening for the existing bucket.
-- The Worker uses the project's secret/service-role key and validates the app session,
-- asset ownership, support-room membership, and moderator scope before signing URLs.
-- This migration does not create a project or bucket and does not affect other buckets.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'elbarzily-staging-uploads'
  ) THEN
    RAISE EXCEPTION 'Expected existing Staging bucket elbarzily-staging-uploads; refusing to continue';
  END IF;

  UPDATE storage.buckets
  SET public = false
  WHERE id = 'elbarzily-staging-uploads' AND public = true;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'elbarzily_staging_deny_direct_client_access'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY elbarzily_staging_deny_direct_client_access
      ON storage.objects
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (bucket_id <> 'elbarzily-staging-uploads')
      WITH CHECK (bucket_id <> 'elbarzily-staging-uploads')
    $policy$;
  END IF;
END $$;
