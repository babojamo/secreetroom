import { db } from '../lib/db';
import { loadEnvConfig } from '@next/env';
import { bootstrapAdmin } from '../lib/bootstrap-admin';
import { JOBS, defaultRole, normalizeName } from '../lib/domain';
loadEnvConfig(process.cwd());
async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters).');
  if (process.env.DEMO_SEED === 'true' && process.env.NODE_ENV === 'production')
    throw new Error('Demo seeding is disabled in production.');
  const guild = await bootstrapAdmin(email, password);
  for (const name of JOBS)
    await db.characterClass.upsert({
      where: { guildId_name: { guildId: guild.id, name } },
      create: { guildId: guild.id, name },
      update: {},
    });
  if (process.env.DEMO_SEED === 'true') {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Demo seeding is disabled in production.');
    for (let i = 0; i < 40; i++) {
      const job = JOBS[i % JOBS.length],
        role = defaultRole(job),
        name = `DEMO-${String(i + 1).padStart(3, '0')}`;
      await db.member.upsert({
        where: {
          guildId_normalizedName: { guildId: guild.id, normalizedName: normalizeName(name) },
        },
        create: {
          guildId: guild.id,
          name,
          normalizedName: normalizeName(name),
          job,
          level: 140 + (i % 21),
          primaryRole: role,
          highDps: i % 4 === 0,
          highAoe: i % 5 === 0,
          core: i % 7 === 0,
          roles: { create: { role } },
          ratings: {
            create: { dps: 5 + (i % 6), aoe: 4 + (i % 7), tank: 5 + (i % 6), support: 5 + (i % 6) },
          },
          notes: 'Explicit demo seed; not a real guild member.',
        },
        update: {},
      });
    }
  }
  console.log('Guild and admin ready. Demo data:', process.env.DEMO_SEED === 'true');
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
