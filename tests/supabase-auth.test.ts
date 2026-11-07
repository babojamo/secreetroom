import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  findUnique: vi.fn(),
  deleteCookie: vi.fn(),
}));
vi.mock('../lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  })),
}));
vi.mock('../lib/db', () => ({ db: { user: { findUnique: mocks.findUnique } } }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ delete: mocks.deleteCookie })) }));
import { session } from '../lib/auth';
import { POST, DELETE } from '../app/api/auth/route';
const authId = '00000000-0000-4000-8000-000000000001';
const request = (email = 'officer@example.com', origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/auth', {
    method: 'POST',
    headers: { origin, host: 'localhost:3000', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-strong-password' }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  mocks.getUser.mockResolvedValue({
    data: { user: { id: authId, email: 'officer@example.com', user_metadata: { role: 'ADMIN' } } },
    error: null,
  });
  mocks.findUnique.mockResolvedValue({
    id: 'profile-1',
    authUserId: authId,
    guildId: 'guild-1',
    role: 'VIEWER',
  });
  mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: authId } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('Supabase authentication and guild identity', () => {
  it('uses the verified immutable ID and database role, not user metadata or email', async () => {
    const user = await session();
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { authUserId: authId } });
    expect(user?.role).toBe('VIEWER');
  });
  it('rejects a forged or expired session without touching guild profiles', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } });
    expect(await session()).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it('does not fall back to legacy sessions when Supabase is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(await session()).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('does not auto-link an unprovisioned Supabase account', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await session()).toBeNull();
    const r = await POST(request('unlinked@example.com'));
    expect(r.status).toBe(403);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('delegates password verification to Supabase and removes the old session cookie', async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'officer@example.com',
      password: 'a-strong-password',
    });
    expect(mocks.deleteCookie).toHaveBeenCalledWith('stoics-session');
  });
  it('rejects invalid Supabase credentials without reading a guild profile', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid' },
    });
    const r = await POST(request('invalid@example.com'));
    expect(r.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it('rejects cross-origin sign-in before calling Supabase', async () => {
    expect((await POST(request('csrf@example.com', 'https://attacker.test'))).ok).toBe(false);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
  it('signs out only the current Supabase session', async () => {
    const r = await DELETE(request());
    expect(r.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.deleteCookie).toHaveBeenCalledWith('stoics-session');
  });
  it('reports provider logout errors instead of falsely reporting success', async () => {
    mocks.signOut.mockResolvedValue({ error: { message: 'offline' } });
    expect((await DELETE(request())).status).toBe(503);
  });
  it('keeps sign-in throttling before the provider request', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid' },
    });
    for (let n = 0; n < 8; n++)
      expect((await POST(request('throttled@example.com'))).status).toBe(401);
    expect((await POST(request('throttled@example.com'))).status).toBe(429);
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(8);
  });
});
