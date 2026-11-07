import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { provisionGuildAccount } from '@/lib/provision-account';
import { session, assertOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { getState } from '@/lib/state';
import {
  memberSchema,
  assignmentSchema,
  normalizeName,
  validateLineup,
  JOBS,
  ROLES,
  Member,
} from '@/lib/domain';
import { generateLineup } from '@/lib/optimizer';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await session();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    if (user.role === 'VIEWER')
      return NextResponse.json({ error: 'Viewer accounts are read-only.' }, { status: 403 });
    const body = z
      .object({ action: z.string(), revision: z.number().int(), payload: z.unknown() })
      .parse(await request.json());
    if (['settings', 'user', 'icon', 'deleteMember'].includes(body.action) && user.role !== 'ADMIN')
      return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
    const state = await getState(user);
    if (state.revision !== body.revision)
      return NextResponse.json(
        { error: 'The guild changed in another session. Refresh and try again.' },
        { status: 409 },
      );
    if (body.action === 'user') {
      await provisionGuildAccount(user, body.revision, body.payload);
      return NextResponse.json({ state: await getState(user), result: null });
    }
    const result = await db.$transaction(
      async (tx) => {
        const changed = await tx.guild.updateMany({
          where: { id: user.guildId, revision: body.revision },
          data: { revision: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new Error('The guild changed in another session. Refresh before saving.');
        let output: unknown = null;
        if (body.action === 'member') {
          const m = memberSchema.parse(body.payload);
          if (m.id && !state.members.some((x) => x.id === m.id))
            throw new Error('Member not found.');
          const { id, roles, dps, aoe, tank, support, ...data } = m;
          const record = { ...data, guildId: user.guildId, normalizedName: normalizeName(m.name) };
          if (id)
            await tx.member.update({
              where: { id },
              data: {
                ...record,
                roles: { deleteMany: {}, create: roles.map((role) => ({ role })) },
                ratings: {
                  upsert: {
                    create: { dps, aoe, tank, support },
                    update: { dps, aoe, tank, support },
                  },
                },
              },
            });
          else
            await tx.member.create({
              data: {
                ...record,
                roles: { create: roles.map((role) => ({ role })) },
                ratings: { create: { dps, aoe, tank, support } },
              },
            });
        } else if (body.action === 'deleteMember') {
          const { id } = z.object({ id: z.string() }).parse(body.payload);
          if (!state.members.some((m) => m.id === id)) throw new Error('Member not found.');
          const references =
            (await tx.assignment.count({ where: { memberId: id } })) +
            (await tx.attendance.count({ where: { memberId: id } }));
          if (references)
            throw new Error('This member has run records. Archive the member to preserve history.');
          await tx.member.delete({ where: { id } });
        } else if (body.action === 'bulk') {
          const p = z
            .object({
              ids: z.array(z.string()).min(1),
              available: z.boolean().optional(),
              role: z.enum(ROLES).optional(),
            })
            .parse(body.payload);
          if (p.ids.some((id) => !state.members.some((m) => m.id === id)))
            throw new Error('Unknown member.');
          if (p.available !== undefined)
            await tx.member.updateMany({
              where: { id: { in: p.ids }, guildId: user.guildId },
              data: { available: p.available },
            });
          if (p.role)
            for (const id of p.ids)
              await tx.roleCapability.upsert({
                where: { memberId_role: { memberId: id, role: p.role } },
                create: { memberId: id, role: p.role },
                update: {},
              });
        } else if (body.action === 'import') {
          const p = z
            .object({
              rows: z
                .array(
                  z.object({
                    name: z.string().trim().min(1).max(60),
                    job: z.enum(JOBS),
                    level: z.number().int().min(1).max(999),
                  }),
                )
                .min(1)
                .max(2000),
            })
            .parse(body.payload);
          const names = p.rows.map((r) => normalizeName(r.name));
          if (new Set(names).size !== names.length)
            throw new Error('Resolve duplicate character names before importing.');
          const { defaultRole } = await import('@/lib/domain');
          for (const row of p.rows) {
            const normalizedName = normalizeName(row.name);
            const old = state.members.find((m) => normalizeName(m.name) === normalizedName);
            if (old) await tx.member.update({ where: { id: old.id }, data: row });
            else {
              const role = defaultRole(row.job);
              await tx.member.create({
                data: {
                  ...row,
                  normalizedName,
                  guildId: user.guildId,
                  primaryRole: role,
                  roles: { create: { role } },
                  ratings: { create: {} },
                },
              });
            }
          }
        } else if (body.action === 'createRun') {
          const p = z
            .object({
              group: z.enum(['RANKING', 'DROP']),
              scheduledAt: z.string().datetime(),
              target: z.number().int().min(1).max(24),
              allowOverlap: z.boolean(),
            })
            .parse(body.payload);
          let event = await tx.event.findFirst({
            where: { guildId: user.guildId, scheduledAt: new Date(p.scheduledAt) },
          });
          if (!event)
            event = await tx.event.create({
              data: { guildId: user.guildId, scheduledAt: new Date(p.scheduledAt) },
            });
          await tx.run.create({
            data: {
              eventId: event.id,
              group: p.group,
              target: p.group === 'RANKING' ? 24 : p.target,
              allowOverlap: p.allowOverlap,
              parties: { create: [0, 1, 2].map((number) => ({ number })) },
            },
          });
        } else if (
          ['saveRoster', 'generate', 'finalize', 'attendance', 'runSettings'].includes(body.action)
        ) {
          const { runId } = z.object({ runId: z.string() }).passthrough().parse(body.payload);
          const run = state.runs.find((r) => r.id === runId);
          if (!run) throw new Error('Run not found or already completed.');
          if (body.action === 'runSettings') {
            const p = z
              .object({
                target: z.number().int().min(1).max(24),
                allowOverlap: z.boolean(),
                exclusions: z.array(z.string()),
                availability: z.array(z.object({ memberId: z.string(), available: z.boolean() })),
              })
              .parse(body.payload);
            if (
              [...p.exclusions, ...p.availability.map((a) => a.memberId)].some(
                (id) => !state.members.some((m) => m.id === id),
              )
            )
              throw new Error('Unknown member.');
            if (run.status !== 'DRAFT') throw new Error('Only drafts can be configured.');
            await tx.run.update({
              where: { id: run.id },
              data: {
                target: run.group === 'RANKING' ? 24 : p.target,
                allowOverlap: p.allowOverlap,
                exclusions: p.exclusions,
                availability: { deleteMany: {}, create: p.availability },
              },
            });
          } else if (body.action === 'attendance') {
            if (run.status !== 'FINALIZED')
              throw new Error('Finalize the planned roster before recording attendance.');
            const p = z
              .object({
                rows: z
                  .array(
                    z.object({
                      memberId: z.string(),
                      present: z.boolean(),
                      party: z.number().int().min(0).max(2),
                      role: z.enum(ROLES),
                    }),
                  )
                  .max(1000),
                duration: z.number().int().min(1).max(86400).nullable(),
                ranking: z.number().int().min(1).nullable(),
                drops: z.string().max(4000),
                notes: z.string().max(4000),
              })
              .parse(body.payload);
            if (new Set(p.rows.map((a) => a.memberId)).size !== p.rows.length)
              throw new Error('Duplicate attendance member.');
            for (const row of p.rows)
              if (!state.members.some((m) => m.id === row.memberId))
                throw new Error('Unknown attendance member.');
            const actual = p.rows
              .filter((a) => a.present)
              .map((a, i) => ({
                memberId: a.memberId,
                party: a.party,
                slot: p.rows
                  .filter((b) => b.present && b.party === a.party)
                  .findIndex((b) => b.memberId === a.memberId),
                role: a.role,
                locked: false,
              }));
            const errors = validateLineup(
              actual,
              { ...run, assignments: [] },
              state.members,
              state.runs,
              true,
              [],
            );
            if (errors.length) throw new Error(errors.join(' '));
            await tx.run.update({
              where: { id: run.id },
              data: {
                status: 'COMPLETED',
                finalizedAt: new Date(),
                duration: p.duration,
                ranking: p.ranking,
                drops: p.drops,
                notes: p.notes,
                attendance: {
                  create: p.rows.map((a) => ({
                    ...a,
                    snapshot: state.members.find(
                      (m) => m.id === a.memberId,
                    )! as unknown as Prisma.InputJsonValue,
                  })),
                },
              },
            });
          } else {
            if (run.status !== 'DRAFT' && body.action !== 'finalize')
              throw new Error(
                'The planned roster is finalized. Record replacements in actual attendance.',
              );
            const requestedTarget =
              body.action === 'saveRoster'
                ? z
                    .object({ target: z.number().int().min(1).max(24).optional() })
                    .parse(body.payload).target
                : undefined;
            if (requestedTarget !== undefined && run.group === 'RANKING' && requestedTarget !== 24)
              throw new Error('Ranking runs always require 24 members.');
            const effectiveRun = { ...run, target: requestedTarget ?? run.target };
            const assignments =
              body.action === 'generate'
                ? generateLineup(
                    run,
                    state.members,
                    state.history,
                    state.runs,
                    state.settings.weights,
                  ).assignments
                : body.action === 'finalize'
                  ? run.assignments
                  : z.object({ assignments: z.array(assignmentSchema).max(24) }).parse(body.payload)
                      .assignments;
            // Unlocking is an explicit save operation; moving a previously locked member still requires a prior save.
            const previous = run.assignments.filter(
              (a) =>
                a.locked &&
                !assignments.some(
                  (b) =>
                    b.memberId === a.memberId &&
                    !b.locked &&
                    b.party === a.party &&
                    b.slot === a.slot &&
                    b.role === a.role,
                ),
            );
            const errors = validateLineup(
              assignments,
              effectiveRun,
              state.members,
              state.runs,
              body.action !== 'saveRoster' || requestedTarget !== undefined,
              previous,
            );
            if (errors.length) throw new Error(errors.join(' '));
            if (body.action === 'finalize')
              await tx.run.update({ where: { id: run.id }, data: { status: 'FINALIZED' } });
            else {
              if (requestedTarget !== undefined)
                await tx.run.update({ where: { id: run.id }, data: { target: requestedTarget } });
              const parties = await tx.party.findMany({ where: { runId: run.id } });
              await tx.assignment.deleteMany({ where: { party: { runId: run.id } } });
              for (const a of assignments) {
                const m = state.members.find((m) => m.id === a.memberId)!;
                await tx.assignment.create({
                  data: {
                    runId: run.id,
                    memberId: a.memberId,
                    partyId: parties.find((p) => p.number === a.party)!.id,
                    slot: a.slot,
                    role: a.role,
                    locked: a.locked,
                    snapshot: m as unknown as Prisma.InputJsonValue,
                  },
                });
              }
              await tx.rosterVersion.create({
                data: {
                  runId: run.id,
                  actorId: user.id,
                  assignments: assignments as unknown as Prisma.InputJsonValue,
                },
              });
            }
            output = {
              warnings: (await import('@/lib/domain')).warnings(assignments, state.members),
            };
          }
        } else if (body.action === 'settings') {
          const weights = z
            .object({
              performance: z.number().min(0).max(20),
              fairness: z.number().min(0).max(20),
              core: z.number().min(0).max(20),
              balance: z.number().min(0).max(20),
            })
            .parse(body.payload);
          await tx.guild.update({ where: { id: user.guildId }, data: { settings: { weights } } });
        } else if (body.action === 'icon') {
          const p = z
            .object({
              job: z.enum(JOBS),
              icon: z
                .string()
                .max(300000)
                .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
            })
            .parse(body.payload);
          await tx.characterClass.upsert({
            where: { guildId_name: { guildId: user.guildId, name: p.job } },
            create: { guildId: user.guildId, name: p.job, icon: p.icon },
            update: { icon: p.icon },
          });
        } else throw new Error('Unknown action.');
        await tx.auditLog.create({
          data: {
            guildId: user.guildId,
            actorId: user.id,
            action: body.action,
            details: {
              ...(body.action === 'user'
                ? { email: (body.payload as { email: string }).email }
                : { payload: body.payload as Prisma.InputJsonValue }),
            },
          },
        });
        return output;
      },
      { timeout: 30000 },
    );
    return NextResponse.json({ state: await getState(user), result });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((i) => i.message).join(' ')
        : error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
          ? 'A record with that name, email, or run schedule already exists.'
          : error instanceof Error
            ? error.message
            : 'Request failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
