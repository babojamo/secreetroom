import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createSupabaseAdminClient } from '../../lib/supabase/admin';
import { randomBytes } from 'node:crypto';
const db = new PrismaClient();
const password = randomBytes(20).toString('hex');
const email = `test-${Date.now()}@stoics.test`;
let guildId: string, authUserId: string;
test.skip(
  process.env.RUN_SUPABASE_E2E !== 'true',
  'Requires a configured disposable Supabase project and RUN_SUPABASE_E2E=true.',
);
test.beforeAll(async () => {
  const { data, error } = await createSupabaseAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error('Could not create Supabase E2E identity.');
  authUserId = data.user.id;
  const guild = await db.guild.create({ data: { name: 'E2E TEST ONLY' } });
  guildId = guild.id;
  await db.user.create({
    data: { email, authUserId, role: 'ADMIN', guildId },
  });
});
test.afterAll(async () => {
  if (guildId)
    await db.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { guildId } });
      const runs = await tx.run.findMany({ where: { event: { guildId } }, select: { id: true } });
      const ids = runs.map((r) => r.id);
      await tx.analysis.deleteMany({ where: { runId: { in: ids } } });
      await tx.rosterVersion.deleteMany({ where: { runId: { in: ids } } });
      await tx.attendance.deleteMany({ where: { runId: { in: ids } } });
      await tx.availability.deleteMany({ where: { runId: { in: ids } } });
      await tx.assignment.deleteMany({ where: { party: { runId: { in: ids } } } });
      await tx.party.deleteMany({ where: { runId: { in: ids } } });
      await tx.run.deleteMany({ where: { id: { in: ids } } });
      await tx.event.deleteMany({ where: { guildId } });
      await tx.member.deleteMany({ where: { guildId } });
      await tx.characterClass.deleteMany({ where: { guildId } });
      await tx.user.deleteMany({ where: { guildId } });
      await tx.guild.delete({ where: { id: guildId } });
    });
  if (authUserId) {
    const removed = await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error('Supabase E2E identity cleanup failed.');
  }
  await db.$disconnect();
});
test('protected APIs reject anonymous users', async ({ request }) => {
  expect((await request.get('/api/state')).status()).toBe(401);
  expect(
    (
      await request.post('/api/command', {
        headers: { Origin: 'http://localhost:3000' },
        data: { action: 'member', revision: 0, payload: {} },
      })
    ).status(),
  ).toBe(401);
});
test('guild workflow persists import, generation, locks, attendance and access controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter command center' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  const api = page.request;
  const origin = 'http://localhost:3000';
  const state = async () => {
    const r = await api.get('/api/state');
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const command = async (action: string, payload: unknown, ok = true) => {
    const s = await state();
    const r = await api.post('/api/command', {
      headers: { Origin: origin },
      data: { action, payload, revision: s.revision },
    });
    const d = await r.json();
    if (ok) expect(r.ok(), JSON.stringify(d)).toBeTruthy();
    else expect(r.ok()).toBeFalsy();
    return d;
  };
  // The importer is exercised through the visible preview and confirmation workflow.
  await page.getByRole('link', { name: 'Guild members' }).click();
  await page.getByRole('button', { name: 'Import roster' }).click();
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
  const csv =
    'Character Name,Class,Level\n' +
    Array.from(
      { length: 40 },
      (_, i) => `TEST-${i === 0 ? 'Αλέξανδρος' : i},${jobs[i % 8]},${150 + (i % 10)}`,
    ).join('\n');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'test-roster.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('button', { name: 'Confirm 40 members' })).toBeEnabled();
  const imported = page.waitForResponse(
    (r) => r.url().endsWith('/api/command') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm 40 members' }).click();
  const importResponse = await imported;
  expect(importResponse.ok(), await importResponse.text()).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('TEST-Αλέξανδρος', { exact: true })).toBeVisible();
  let s = await state();
  expect(s.members).toHaveLength(40);
  const member = s.members[0];
  await command('member', { ...member, dps: 10, core: true });
  await command('import', { rows: [{ name: member.name, job: member.job, level: 170 }] });
  s = await state();
  expect(s.members.find((m: { id: string }) => m.id === member.id)).toMatchObject({
    dps: 10,
    core: true,
    level: 170,
  });
  await command('createRun', {
    group: 'RANKING',
    scheduledAt: '2026-11-08T14:00:00.000Z',
    target: 24,
    allowOverlap: false,
  });
  s = await state();
  const run = s.runs[0];
  await command('generate', { runId: run.id });
  s = await state();
  expect(s.runs[0].assignments).toHaveLength(24);
  await page.getByRole('link', { name: 'Roster builder' }).click();
  await page.waitForURL('**/roster');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Built for the leaderboard' })).toBeVisible();
  await expect(page.locator('.slot-character')).toHaveCount(24);
  const firstDps = s.runs[0].assignments.find((a: { role: string }) => a.role === 'DPS');
  const secondDps = s.runs[0].assignments.find(
    (a: { role: string; party: number }) => a.role === 'DPS' && a.party !== firstDps.party,
  );
  const source = page.locator(`[data-member-id="${firstDps.memberId}"]`);
  const destination = page.locator(
    `[data-party="${secondDps.party}"][data-slot="${secondDps.slot}"]`,
  );
  const sourceBox = await source.boundingBox(),
    targetBox = await destination.boundingBox();
  expect(sourceBox && targetBox).toBeTruthy();
  await page.mouse.move(sourceBox!.x + 15, sourceBox!.y + 15);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + 25, sourceBox!.y + 15, { steps: 3 });
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + 25, { steps: 15 });
  await page.mouse.up();
  await expect(destination.locator(`[data-member-id="${firstDps.memberId}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(destination.locator(`[data-member-id="${secondDps.memberId}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(destination.locator(`[data-member-id="${firstDps.memberId}"]`)).toBeVisible();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/command') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  for (const type of ['CSV', 'PNG', 'PDF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: type, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`stoics-lineup.${type.toLowerCase()}`);
    await file.saveAs(`output/lineup-test.${type.toLowerCase()}`);
  }
  await page.screenshot({ path: 'output/builder-test.png', fullPage: true });
  s = await state();
  const before = s.runs[0].assignments;
  const locked = { ...before[0], locked: true };
  await command('saveRoster', {
    runId: run.id,
    assignments: before.map((a: { memberId: string }) =>
      a.memberId === locked.memberId ? locked : a,
    ),
  });
  await command('saveRoster', { runId: run.id, target: 23, assignments: before }, false);
  const rejected = await command(
    'saveRoster',
    {
      runId: run.id,
      assignments: before.filter((a: { memberId: string }) => a.memberId !== locked.memberId),
    },
    false,
  );
  expect(rejected.error).toContain('Unlock');
  await command('generate', { runId: run.id });
  s = await state();
  expect(s.runs[0].assignments).toContainEqual(locked);
  await command(
    'saveRoster',
    { runId: run.id, assignments: [...s.runs[0].assignments, s.runs[0].assignments[0]] },
    false,
  );
  await command('finalize', { runId: run.id });
  s = await state();
  const planned = s.runs[0].assignments;
  const dps = planned.find((a: { role: string }) => a.role === 'DPS');
  const replacement = s.members.find(
    (m: { id: string; roles: string[] }) =>
      m.roles.includes('DPS') && !planned.some((a: { memberId: string }) => a.memberId === m.id),
  );
  expect(replacement).toBeTruthy();
  const rows = planned.map((a: { memberId: string; party: number; role: string }) => ({
    memberId: a.memberId,
    party: a.party,
    role: a.role,
    present: a.memberId !== dps.memberId,
  }));
  rows.push({ memberId: replacement.id, party: dps.party, role: 'DPS', present: true });
  await command('attendance', {
    runId: run.id,
    rows,
    duration: 420,
    ranking: 3,
    drops: 'Test reward',
    notes: 'E2E only',
  });
  s = await state();
  expect(s.history).toHaveLength(1);
  expect(s.history[0].attendance.filter((a: { present: boolean }) => a.present)).toHaveLength(24);
  expect(
    s.history[0].attendance.find((a: { memberId: string }) => a.memberId === dps.memberId).present,
  ).toBe(false);
  const snap = s.history[0].attendance.find(
    (a: { memberId: string }) => a.memberId === replacement.id,
  ).snapshot.name;
  await command('member', { ...replacement, name: 'TEST-renamed-after-run' });
  s = await state();
  expect(
    s.history[0].attendance.find((a: { memberId: string }) => a.memberId === replacement.id)
      .snapshot.name,
  ).toBe(snap);
  await command('createRun', {
    group: 'DROP',
    scheduledAt: '2026-11-08T17:00:00.000Z',
    target: 9,
    allowOverlap: false,
  });
  s = await state();
  const drop = s.runs.find((r: { group: string }) => r.group === 'DROP');
  await command('generate', { runId: drop.id });
  s = await state();
  expect(s.runs[0].assignments).toHaveLength(9);
  const eight = s.runs[0].assignments.filter((a: { party: number }) => a.party === 0);
  await command('saveRoster', { runId: drop.id, target: 8, assignments: eight.slice(0, 7) }, false);
  await command('saveRoster', { runId: drop.id, target: 8, assignments: eight });
  s = await state();
  expect(s.runs[0].target).toBe(8);
  expect(s.runs[0].assignments).toHaveLength(8);
  const stale = await api.post('/api/command', {
    headers: { Origin: origin },
    data: { action: 'generate', payload: { runId: drop.id }, revision: -1 },
  });
  expect(stale.status()).toBe(409);
  const csrf = await api.post('/api/command', {
    headers: { Origin: 'https://untrusted.test' },
    data: { action: 'generate', payload: { runId: drop.id }, revision: s.revision },
  });
  expect(csrf.ok()).toBeFalsy();
  const ai = await api.post('/api/ai', {
    headers: { Origin: origin },
    data: { runId: drop.id, prompt: 'Analyze' },
  });
  if (!process.env.OPENAI_API_KEY) expect(ai.status()).toBe(503);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/dashboard-test.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/mobile-test.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await db.user.update({ where: { email }, data: { role: 'VIEWER' } });
  const forbidden = await api.post('/api/command', {
    headers: { Origin: origin },
    data: { action: 'generate', payload: { runId: drop.id }, revision: s.revision },
  });
  expect(forbidden.status()).toBe(403);
});
