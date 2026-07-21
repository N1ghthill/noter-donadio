import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuthRepository, StoredSession, StoredUser } from './auth.service.js';
import { AuthService } from './auth.service.js';
import { ScryptPasswordHasher } from './password-hasher.js';

class MemoryAuthRepository implements AuthRepository {
  public user: StoredUser | null = null;
  public session?: { tokenHash: string; expiresAt: Date; revoked: boolean };

  public async findUser(_workspace: string, email: string) {
    return this.user?.email === email ? this.user : null;
  }
  public async createSession(input: { tokenHash: string; expiresAt: Date }) {
    this.session = { ...input, revoked: false };
  }
  public async findActiveSession(tokenHash: string, now: Date): Promise<StoredSession | null> {
    if (!this.user || !this.session || this.session.revoked || this.session.tokenHash !== tokenHash || this.session.expiresAt <= now) return null;
    return { ...this.user, sessionId: 'session-id', lastSeenAt: new Date() };
  }
  public async touchSession() {}
  public async revokeSession(tokenHash: string) {
    if (this.session?.tokenHash === tokenHash) this.session.revoked = true;
  }
}

test('login cria sessão revogável sem expor o hash da senha', async () => {
  const hasher = new ScryptPasswordHasher({ N: 2 ** 14, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
  const repository = new MemoryAuthRepository();
  repository.user = {
    userId: 'd86e2931-7552-41f6-831f-85dd34c8bf29',
    workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
    email: 'admin@example.test',
    displayName: 'Admin',
    role: 'admin',
    status: 'active',
    passwordHash: await hasher.hash('uma-senha-de-teste-comprida'),
  };
  const service = new AuthService(repository, hasher);

  const login = await service.login('noter-donadio', ' ADMIN@example.test ', 'uma-senha-de-teste-comprida');
  assert.equal('passwordHash' in login.user, false);
  assert.deepEqual(await service.authenticate(login.token), login.user);

  await service.logout(login.token);
  assert.equal(await service.authenticate(login.token), null);
});
