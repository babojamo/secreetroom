import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  createAuth: vi.fn(),
  getAuth: vi.fn(),
  deleteAuth: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  findProfile: vi.fn(),
  transaction: vi.fn(),
  upsert: vi.fn(),
  findGuild: vi.fn(),
  createGuild: vi.fn(),
}));
vi.mock('../lib/db', () => ({
  db: { user: { findUnique: m.findProfile }, $transaction: m.transaction },
}));
vi.mock('../lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { createUser: m.createAuth, getUserById: m.getAuth, deleteUser: m.deleteAuth } },
  }),
}));
vi.mock('../lib/supabase/config', () => ({
  supabaseConfig: () => ({ url: 'https://test.supabase.co', key: 'public-test' }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithPassword: m.login, signOut: m.logout } }),
}));
import { bootstrapAdmin } from '../lib/bootstrap-admin';
const email = 'admin@example.com',
  password = 'test-password-strong',
  authId = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  vi.resetAllMocks();
  m.findProfile.mockResolvedValue(null);
  m.createAuth.mockResolvedValue({ data: { user: { id: authId } }, error: null });
  m.findGuild.mockResolvedValue({ id: 'guild-1' });
  m.deleteAuth.mockResolvedValue({ error: null });
  m.transaction.mockImplementation(async (fn) =>
    fn({
      user: { findUnique: m.findProfile, upsert: m.upsert },
      guild: { findFirst: m.findGuild, findUniqueOrThrow: m.findGuild, create: m.createGuild },
    }),
  );
});
it('bootstraps a new Supabase identity and an initial Admin profile', async () => {
  expect(await bootstrapAdmin(email, password)).toEqual({ id: 'guild-1' });
  expect(m.upsert).toHaveBeenCalledWith({
    where: { email },
    create: { email, authUserId: authId, role: 'ADMIN', guildId: 'guild-1' },
    update: { authUserId: authId, passwordHash: null },
  });
});
it('checks a linked identity without resetting its password or promoting its guild role', async () => {
  m.findProfile.mockResolvedValue({
    id: 'old',
    authUserId: authId,
    guildId: 'guild-1',
    role: 'VIEWER',
  });
  m.getAuth.mockResolvedValue({ data: { user: { id: authId, email } }, error: null });
  await bootstrapAdmin(email, password);
  expect(m.createAuth).not.toHaveBeenCalled();
  expect(m.upsert.mock.calls[0][0].update).toEqual({ authUserId: authId, passwordHash: null });
});
it('requires existing Auth credentials before linking a matching email', async () => {
  m.createAuth.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } });
  m.login.mockResolvedValue({ data: { user: { id: authId } }, error: null });
  await bootstrapAdmin(email, password);
  expect(m.login).toHaveBeenCalledWith({ email, password });
  expect(m.logout).toHaveBeenCalledWith({ scope: 'local' });
  expect(m.upsert).toHaveBeenCalledOnce();
});
it('refuses email-only linking when the supplied credentials do not authenticate', async () => {
  m.createAuth.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } });
  m.login.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
  await expect(bootstrapAdmin(email, password)).rejects.toThrow('current password');
  expect(m.transaction).not.toHaveBeenCalled();
  expect(m.deleteAuth).not.toHaveBeenCalled();
});
it('does not replace an identity mapping that changed during bootstrap', async () => {
  m.findProfile
    .mockResolvedValueOnce(null)
    .mockResolvedValue({ authUserId: 'other-id', guildId: 'guild-1' });
  await expect(bootstrapAdmin(email, password)).rejects.toThrow('Refusing');
  expect(m.deleteAuth).toHaveBeenCalledWith(authId);
});
it('compensates newly created Auth identities after database failures', async () => {
  m.transaction.mockRejectedValue(new Error('offline'));
  await expect(bootstrapAdmin(email, password)).rejects.toThrow('offline');
  expect(m.deleteAuth).toHaveBeenCalledWith(authId);
});
