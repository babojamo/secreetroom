import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prepareCommand } from '../sites/stoics-manager/worker/commands';
import type { State } from '../lib/domain';
loadEnvConfig(process.cwd());
const db = new PrismaClient();
let guildId: string, profileId: string;
const actor = randomUUID();
describe.skipIf(process.env.RUN_DATABASE_TESTS !== 'true')(
  'Sites HTTPS bridge against normalized PostgreSQL tables',
  () => {
    const state = async () => {
      const rows = await db.$queryRaw<
        { data: State }[]
      >`SELECT public.stoics_sites_state(${actor}::uuid) AS data`;
      return rows[0].data;
    };
    const command = async (action: string, payload: unknown) => {
      const s = await state();
      const changes = prepareCommand(action, payload, s);
      await db.$executeRaw`SELECT public.stoics_sites_commit(${actor}::uuid,${s.revision}::int,${action},${JSON.stringify(changes)}::jsonb)`;
      return state();
    };
    beforeAll(async () => {
      const g = await db.guild.create({ data: { name: 'SITES BRIDGE TEST ONLY' } });
      guildId = g.id;
      const u = await db.user.create({
        data: { email: `sites-${actor}@example.com`, authUserId: actor, role: 'ADMIN', guildId },
      });
      profileId = u.id;
    });
    afterAll(async () => {
      if (guildId) {
        const runs = await db.run.findMany({ where: { event: { guildId } }, select: { id: true } }),
          ids = runs.map((r) => r.id);
        await db.$transaction(async (tx) => {
          await tx.analysis.deleteMany({ where: { runId: { in: ids } } });
          await tx.rosterVersion.deleteMany({ where: { runId: { in: ids } } });
          await tx.attendance.deleteMany({ where: { runId: { in: ids } } });
          await tx.assignment.deleteMany({ where: { runId: { in: ids } } });
          await tx.availability.deleteMany({ where: { runId: { in: ids } } });
          await tx.party.deleteMany({ where: { runId: { in: ids } } });
          await tx.run.deleteMany({ where: { id: { in: ids } } });
          await tx.event.deleteMany({ where: { guildId } });
          await tx.auditLog.deleteMany({ where: { guildId } });
          await tx.member.deleteMany({ where: { guildId } });
          await tx.characterClass.deleteMany({ where: { guildId } });
          await tx.user.deleteMany({ where: { guildId } });
          await tx.guild.delete({ where: { id: guildId } });
        });
      }
      await db.$disconnect();
    });
    it('persists import, ratings, generation, locks, attendance snapshots and audit records atomically', async () => {
      let s = await state();
      expect(s.members).toEqual([]);
      expect(s.revision).toBe(0);
      const jobs = [
        'Templar',
        'Seraph',
        'Forcemaster',
        'Arcanist',
        'Arcanist',
        'Slayer',
        'Slayer',
        'Slayer',
      ];
      s = await command('import', {
        rows: Array.from({ length: 40 }, (_, i) => ({
          name: `TEST-${i === 0 ? 'Αλέξανδρος' : i}`,
          job: jobs[i % 8],
          level: 150 + (i % 10),
        })),
      });
      expect(s.members).toHaveLength(40);
      const m = s.members[0];
      s = await command('member', { ...m, dps: 10, core: true });
      s = await command('import', { rows: [{ name: m.name, job: m.job, level: 175 }] });
      expect(s.members.find((x) => x.id === m.id)).toMatchObject({
        dps: 10,
        core: true,
        level: 175,
      });
      s = await command('createRun', {
        group: 'RANKING',
        scheduledAt: '2026-11-08T14:00:00.000Z',
        target: 24,
        allowOverlap: false,
      });
      const runId = s.runs[0].id;
      s = await command('generate', { runId });
      expect(s.runs[0].assignments).toHaveLength(24);
      const lock = { ...s.runs[0].assignments[0], locked: true };
      s = await command('saveRoster', {
        runId,
        assignments: s.runs[0].assignments.map((a) => (a.memberId === lock.memberId ? lock : a)),
      });
      s = await command('generate', { runId });
      expect(s.runs[0].assignments).toContainEqual(lock);
      const planned = s.runs[0].assignments;
      await expect(
        command('saveRoster', {
          runId,
          assignments: planned.filter((a) => a.memberId !== lock.memberId),
        }),
      ).rejects.toThrow('Unlock');
      s = await command('finalize', { runId });
      expect(s.runs[0].status).toBe('FINALIZED');
      s = await command('attendance', {
        runId,
        rows: planned.map((a) => ({
          memberId: a.memberId,
          party: a.party,
          role: a.role,
          present: true,
        })),
        duration: 420,
        ranking: 3,
        drops: 'TEST reward',
        notes: 'TEST only',
      });
      expect(s.history).toHaveLength(1);
      expect(s.runs).toHaveLength(0);
      expect(s.history[0].attendance).toHaveLength(24);
      expect(s.history[0].duration).toBe(420);
      const actual = s.history[0].attendance[0];
      const member = s.members.find((m) => m.id === actual.memberId)!;
      s = await command('member', { ...member, name: 'TEST-renamed' });
      expect(s.history[0].attendance[0].snapshot.name).toBe(actual.snapshot.name);
      s = await command('createRun', {
        group: 'DROP',
        scheduledAt: '2026-11-08T17:00:00.000Z',
        target: 9,
        allowOverlap: false,
      });
      const dropId = s.runs[0].id;
      s = await command('generate', { runId: dropId });
      expect(s.runs[0].assignments).toHaveLength(9);
      expect(s.audits.length).toBeGreaterThan(8);
      expect(s.audits.some((a) => a.action === 'attendance')).toBe(true);
    });
    it('rejects stale commits before mutation', async () => {
      const s = await state();
      await expect(
        db.$executeRaw`SELECT public.stoics_sites_commit(${actor}::uuid,${s.revision - 1}::int,'settings','{}'::jsonb)`,
      ).rejects.toThrow('changed in another session');
      expect((await state()).revision).toBe(s.revision);
    });
    it('checks current database roles on every commit', async () => {
      await db.user.update({ where: { id: profileId }, data: { role: 'VIEWER' } });
      const s = await state();
      await expect(
        db.$executeRaw`SELECT public.stoics_sites_commit(${actor}::uuid,${s.revision}::int,'settings','{}'::jsonb)`,
      ).rejects.toThrow('Management access');
      await db.user.update({ where: { id: profileId }, data: { role: 'ADMIN' } });
    });
    it('does not grant bridge execution to PUBLIC', async () => {
      const rows = await db.$queryRaw<
        { name: string }[]
      >`SELECT p.proname AS name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname LIKE 'stoics_sites_%' AND a.grantee=0 AND a.privilege_type='EXECUTE'`;
      expect(rows).toEqual([]);
    });
  },
);
