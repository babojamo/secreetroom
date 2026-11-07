-- Preserve existing guild IDs, audit relations, and legacy hashes during the auth transition.
-- Old sessions/hashes no longer authorize access; explicitly link identities with the admin seed.
ALTER TABLE "User" ADD COLUMN "authUserId" UUID;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- All data access is through authorized Next.js handlers and server-side Prisma.
-- Deny direct Data API access, including self-service role/profile changes.
DO $$
DECLARE
  table_name text;
  api_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Guild','User','CharacterClass','Member','RoleCapability','Rating','Availability','Event','Run','Party','Assignment','Attendance','RosterVersion','Analysis','AuditLog']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
