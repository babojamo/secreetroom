import { createClient } from '@supabase/supabase-js';
import { db } from './db';
import { createSupabaseAdminClient } from './supabase/admin';
import { supabaseConfig } from './supabase/config';

/** Explicit operator-run bootstrap; never resets passwords or promotes an existing guild profile. */
export async function bootstrapAdmin(email: string, password: string) {
  const admin = createSupabaseAdminClient();
  const existing = await db.user.findUnique({ where: { email } });
  let created = false;
  let authUserId = existing?.authUserId;
  if (authUserId) {
    const { data, error } = await admin.auth.admin.getUserById(authUserId);
    if (error || data.user?.email?.toLowerCase() !== email)
      throw new Error(
        'Existing guild identity does not match Supabase. Review the account mapping before retrying.',
      );
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (!error && data.user) {
      authUserId = data.user.id;
      created = true;
    } else if (error && ['email_exists', 'user_already_exists'].includes(error.code ?? '')) {
      // Linking an existing identity requires its actual credentials, not just a matching email.
      const { url, key } = supabaseConfig();
      const auth = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const login = await auth.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.user)
        throw new Error(
          'This email already exists in Supabase. Set ADMIN_PASSWORD to that account’s current password to explicitly link it.',
        );
      authUserId = login.data.user.id;
      await auth.auth.signOut({ scope: 'local' });
    } else
      throw new Error(
        'Supabase administrator creation failed. Check project credentials, email validity, and Auth password requirements.',
      );
  }
  if (!authUserId) throw new Error('Supabase returned no administrator identity.');
  try {
    return await db.$transaction(async (tx) => {
      const profile = await tx.user.findUnique({ where: { email } });
      if (profile?.authUserId && profile.authUserId !== authUserId)
        throw new Error('Refusing to replace an existing Supabase identity mapping.');
      let guild = profile
        ? await tx.guild.findUniqueOrThrow({ where: { id: profile.guildId } })
        : await tx.guild.findFirst({ where: { name: 'STOICS' } });
      if (!guild) guild = await tx.guild.create({ data: { name: 'STOICS' } });
      await tx.user.upsert({
        where: { email },
        create: { email, authUserId, role: 'ADMIN', guildId: guild.id },
        update: { authUserId, passwordHash: null },
      });
      return guild;
    });
  } catch (error) {
    if (created) {
      const rollback = await admin.auth.admin.deleteUser(authUserId);
      if (rollback.error)
        throw new Error(
          `Admin bootstrap failed; remove the unlinked Supabase Auth identity ${authUserId} before retrying.`,
        );
    }
    throw error;
  }
}
