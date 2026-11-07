import { z } from 'zod';
import { db } from './db';
import { createSupabaseAdminClient } from './supabase/admin';

export const accountSchema = z.object({
  email: z
    .string()
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(200),
  role: z.enum(['ADMIN', 'OFFICER', 'VIEWER']),
});

/** Auth and Postgres cannot share a transaction: compensate an Auth create if DB commit fails. */
export async function provisionGuildAccount(
  actor: { id: string; guildId: string; role: string },
  revision: number,
  input: unknown,
) {
  if (actor.role !== 'ADMIN') throw new Error('Administrator access required.');
  const p = accountSchema.parse(input);
  const existing = await db.user.findUnique({ where: { email: p.email } });
  if (existing && (existing.guildId !== actor.guildId || existing.authUserId))
    throw new Error('An account with this email already exists.');
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: p.password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(
      'Unable to create Supabase account. Check for an existing email and review the project’s Auth password requirements.',
    );
  const authUserId = data.user.id;
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.guild.updateMany({
        where: { id: actor.guildId, revision },
        data: { revision: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new Error('The guild changed in another session. Refresh before saving.');
      if (existing) {
        const linked = await tx.user.updateMany({
          where: { id: existing.id, guildId: actor.guildId, authUserId: null },
          data: { authUserId, role: p.role, passwordHash: null },
        });
        if (linked.count !== 1)
          throw new Error('The account changed before it could be linked. Refresh and retry.');
      } else
        await tx.user.create({
          data: { guildId: actor.guildId, email: p.email, authUserId, role: p.role },
        });
      await tx.auditLog.create({
        data: {
          guildId: actor.guildId,
          actorId: actor.id,
          action: 'user',
          details: { email: p.email, role: p.role, authUserId },
        },
      });
    });
  } catch (error) {
    const rollback = await admin.auth.admin.deleteUser(authUserId);
    if (rollback.error)
      throw new Error(
        `Account setup failed; remove the unlinked Supabase Auth identity ${authUserId} before retrying. No guild permissions were granted.`,
      );
    throw error;
  }
}
