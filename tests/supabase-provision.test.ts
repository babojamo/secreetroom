import { beforeEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createAuth: vi.fn(),
  deleteAuth: vi.fn(),
  transaction: vi.fn(),
  updateRevision: vi.fn(),
  createProfile: vi.fn(),
  linkProfile: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../lib/db', () => ({
  db: { user: { findUnique: m.findUnique }, $transaction: m.transaction },
}));
vi.mock('../lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { createUser: m.createAuth, deleteUser: m.deleteAuth } },
  }),
}));
import { provisionGuildAccount } from '../lib/provision-account';
const actor = { id: 'admin-1', guildId: 'guild-1', role: 'ADMIN' },
  input = { email: 'officer@example.com', password: 'a-secure-test-password', role: 'OFFICER' };
const authUserId = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  m.findUnique.mockResolvedValue(null);
  m.createAuth.mockResolvedValue({ data: { user: { id: authUserId } }, error: null });
  m.deleteAuth.mockResolvedValue({ error: null });
  m.updateRevision.mockResolvedValue({ count: 1 });
  m.linkProfile.mockResolvedValue({ count: 1 });
  m.transaction.mockImplementation(async (fn) =>
    fn({
      guild: { updateMany: m.updateRevision },
      user: { create: m.createProfile, updateMany: m.linkProfile },
      auditLog: { create: m.audit },
    }),
  );
});
describe('Supabase account provisioning', () => {
  it('creates the Auth identity before atomically granting guild permissions', async () => {
    await provisionGuildAccount(actor, 4, input);
    expect(m.createAuth).toHaveBeenCalledWith({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    expect(m.createProfile).toHaveBeenCalledWith({
      data: { guildId: 'guild-1', email: input.email, authUserId, role: 'OFFICER' },
    });
    expect(m.audit).toHaveBeenCalledOnce();
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain(input.password);
    expect(m.deleteAuth).not.toHaveBeenCalled();
  });
  it('enforces Admin authorization before creating an identity', async () => {
    await expect(provisionGuildAccount({ ...actor, role: 'OFFICER' }, 4, input)).rejects.toThrow(
      'Administrator',
    );
    expect(m.createAuth).not.toHaveBeenCalled();
  });
  it('compensates an Auth create if the guild revision became stale', async () => {
    m.updateRevision.mockResolvedValue({ count: 0 });
    await expect(provisionGuildAccount(actor, 4, input)).rejects.toThrow('changed');
    expect(m.deleteAuth).toHaveBeenCalledWith(authUserId);
    expect(m.createProfile).not.toHaveBeenCalled();
  });
  it('compensates a database failure without leaving a sign-in-enabled guild profile', async () => {
    m.createProfile.mockRejectedValue(new Error('database failed'));
    await expect(provisionGuildAccount(actor, 4, input)).rejects.toThrow('database failed');
    expect(m.deleteAuth).toHaveBeenCalledWith(authUserId);
  });
  it('reports the orphan identity if the provider also fails to compensate', async () => {
    m.transaction.mockRejectedValue(new Error('offline'));
    m.deleteAuth.mockResolvedValue({ error: { message: 'offline' } });
    await expect(provisionGuildAccount(actor, 4, input)).rejects.toThrow(authUserId);
  });
  it('does not delete an existing identity when Supabase refuses the create', async () => {
    m.createAuth.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists' } });
    await expect(provisionGuildAccount(actor, 4, input)).rejects.toThrow('Unable to create');
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.deleteAuth).not.toHaveBeenCalled();
  });
  it('cannot adopt an existing profile from another guild', async () => {
    m.findUnique.mockResolvedValue({ id: 'other', guildId: 'guild-other', authUserId: null });
    await expect(provisionGuildAccount(actor, 4, input)).rejects.toThrow('already exists');
    expect(m.createAuth).not.toHaveBeenCalled();
  });
  it('explicitly links a legacy profile without changing its ID or historical relations', async () => {
    m.findUnique.mockResolvedValue({ id: 'legacy-id', guildId: 'guild-1', authUserId: null });
    await provisionGuildAccount(actor, 4, input);
    expect(m.linkProfile).toHaveBeenCalledWith({
      where: { id: 'legacy-id', guildId: 'guild-1', authUserId: null },
      data: { authUserId, role: 'OFFICER', passwordHash: null },
    });
    expect(m.createProfile).not.toHaveBeenCalled();
  });
});
