import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), getAll: vi.fn(), set: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.create }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: mocks.getAll, set: mocks.set })),
}));
import { createSupabaseServerClient } from '../lib/supabase/server';
import { supabaseConfig } from '../lib/supabase/config';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());
it('uses a new SSR client for every request with secure HttpOnly production cookies', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  await createSupabaseServerClient();
  await createSupabaseServerClient();
  expect(mocks.create).toHaveBeenCalledTimes(2);
  const [url, key, options] = mocks.create.mock.calls[0];
  expect(url).toBe('https://test.supabase.co');
  expect(key).toBe('publishable-test');
  expect(options.cookieOptions).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
  mocks.getAll.mockReturnValue([{ name: 'sb-token', value: 'old' }]);
  expect(options.cookies.getAll()).toEqual([{ name: 'sb-token', value: 'old' }]);
  options.cookies.setAll([
    { name: 'sb-token.0', value: 'refreshed', options: { httpOnly: true, path: '/' } },
  ]);
  expect(mocks.set).toHaveBeenCalledWith('sb-token.0', 'refreshed', { httpOnly: true, path: '/' });
});
it('supports a legacy anon key without ever using a secret key as the session key', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'legacy-anon');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'never-public');
  expect(supabaseConfig().key).toBe('legacy-anon');
});
it('fails clearly when only a server secret is provided', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'never-public');
  expect(() => supabaseConfig()).toThrow('PUBLISHABLE_KEY');
});
