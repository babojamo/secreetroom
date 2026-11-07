import { NextResponse } from 'next/server';
import { session } from '@/lib/auth';
import { getState } from '@/lib/state';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await session();
    if (!user) return NextResponse.json({ error: 'Sign in to access the guild.' }, { status: 401 });
    return NextResponse.json(await getState(user), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      {
        error:
          'Guild data unavailable. Check the Supabase connection, migrations, and linked guild account.',
      },
      { status: 503 },
    );
  }
}
