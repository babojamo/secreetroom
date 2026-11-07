import 'server-only';
import { createSupabaseServerClient } from './supabase/server';
import { db } from './db';
export async function session() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = await createSupabaseServerClient();
  // getUser verifies the identity with Supabase Auth. Cookie content is never an authority.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  // Guild permissions come from our database, never email or editable user_metadata.
  return db.user.findUnique({ where: { authUserId: user.id } });
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) throw new Error('Invalid request origin.');
  const source = new URL(origin);
  if (
    !['http:', 'https:'].includes(source.protocol) ||
    source.host !== host ||
    (process.env.APP_ORIGIN && source.origin !== process.env.APP_ORIGIN)
  ) {
    throw new Error('Invalid request origin.');
  }
}
