import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { assertOrigin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
export const runtime = 'nodejs';
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { email, password } = z
      .object({ email: z.string().email().max(200), password: z.string().min(1).max(256) })
      .parse(await request.json());
    const k = email.toLowerCase();
    const recent = attempts.get(k);
    if (recent && recent.until > Date.now() && recent.count >= 8)
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 },
      );
    attempts.set(k, {
      count: recent && recent.until > Date.now() ? recent.count + 1 : 1,
      until: Date.now() + 900000,
    });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: k, password });
    if (error || !data.user)
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    const profile = await db.user.findUnique({ where: { authUserId: data.user.id } });
    if (!profile) {
      await supabase.auth.signOut({ scope: 'local' });
      return NextResponse.json(
        {
          error:
            'Your Supabase account has not been granted guild access. Contact a guild administrator.',
        },
        { status: 403 },
      );
    }
    // Retire any old custom session cookie; legacy tokens never authorize requests.
    (await cookies()).delete('stoics-session');
    attempts.delete(k);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error:
          'Sign-in unavailable. Configure Supabase and run the database migrations and admin seed.',
      },
      { status: 503 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error)
        return NextResponse.json({ error: 'Unable to sign out. Please retry.' }, { status: 503 });
    }
    (await cookies()).delete('stoics-session');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  }
}
