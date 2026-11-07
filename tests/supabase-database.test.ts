import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
loadEnvConfig(process.cwd());
const db = new PrismaClient();
let guildId: string;
describe.skipIf(process.env.RUN_DATABASE_TESTS !== 'true')(
  'Supabase migration against real PostgreSQL',
  () => {
    beforeAll(async () => {
      const guild = await db.guild.create({ data: { name: 'SUPABASE MIGRATION TEST ONLY' } });
      guildId = guild.id;
    });
    afterAll(async () => {
      if (guildId) {
        await db.user.deleteMany({ where: { guildId } });
        await db.guild.delete({ where: { id: guildId } });
      }
      await db.$disconnect();
    });
    it('supports both explicitly unlinked legacy profiles and unique Supabase UUIDs', async () => {
      const legacy = await db.user.create({
        data: {
          email: `legacy-${guildId}@example.com`,
          passwordHash: 'legacy-hash-not-used-for-auth',
          guildId,
        },
      });
      expect(legacy.authUserId).toBeNull();
      const authUserId = randomUUID();
      await db.user.create({ data: { email: `new-${guildId}@example.com`, authUserId, guildId } });
      await expect(
        db.user.create({
          data: { email: `duplicate-${guildId}@example.com`, authUserId, guildId },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
    it('enables RLS on every guild data table', async () => {
      const rows = await db.$queryRaw<
        { relname: string; relrowsecurity: boolean }[]
      >`SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('Guild','User','CharacterClass','Member','RoleCapability','Rating','Availability','Event','Run','Party','Assignment','Attendance','RosterVersion','Analysis','AuditLog')`;
      expect(rows).toHaveLength(15);
      expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    });
    it('denies rows to a nonprivileged role even if SELECT is accidentally re-granted', async () => {
      // Role name is generated entirely here; identifiers cannot use SQL parameter bindings.
      const role = `stoics_rls_${randomUUID().replaceAll('-', '')}`;
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
        await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
        await tx.$executeRawUnsafe(`GRANT SELECT ON TABLE public."Guild" TO ${role}`);
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM public."Guild" WHERE id=${guildId}`;
        expect(rows).toEqual([]);
        await tx.$executeRawUnsafe('RESET ROLE');
        await tx.$executeRawUnsafe(`REVOKE SELECT ON TABLE public."Guild" FROM ${role}`);
        await tx.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM ${role}`);
        await tx.$executeRawUnsafe(`DROP ROLE ${role}`);
      });
    });
  },
);
