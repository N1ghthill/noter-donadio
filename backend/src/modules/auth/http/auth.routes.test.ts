import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type { AuthRepository, StoredSession, StoredUser } from '../domain/auth.service.js';
import { AuthService } from '../domain/auth.service.js';
import { ScryptPasswordHasher } from '../domain/password-hasher.js';

class RouteAuthRepository implements AuthRepository {
  public user?: StoredUser;
  private session?: { tokenHash: string; expiresAt: Date; revoked: boolean };

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
  public async listActiveSessions(_userId: string, _workspaceId: string, now: Date) {
    if (!this.session || this.session.revoked || this.session.expiresAt <= now) return [];
    return [{
      id: '54eb359b-6fb4-4d51-8c07-8c55ac7efd65', tokenHash: this.session.tokenHash,
      createdAt: now, lastSeenAt: now, expiresAt: this.session.expiresAt,
    }];
  }
  public async revokeSessionById(sessionId: string) {
    if (sessionId !== '54eb359b-6fb4-4d51-8c07-8c55ac7efd65' || !this.session) return false;
    this.session.revoked = true;
    return true;
  }
}

test('login, consulta e logout usam cookie HttpOnly revogável', async (context) => {
  const hasher = new ScryptPasswordHasher({ N: 2 ** 14, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
  const repository = new RouteAuthRepository();
  repository.user = {
    userId: 'd86e2931-7552-41f6-831f-85dd34c8bf29',
    workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
    email: 'admin@example.test',
    displayName: 'Admin',
    role: 'admin',
    status: 'active',
    passwordHash: await hasher.hash('uma-senha-de-teste-comprida'),
  };
  const app = buildApp({ authService: new AuthService(repository, hasher), secureCookie: false });
  context.after(async () => app.close());

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      workspace: 'noter-donadio',
      email: 'admin@example.test',
      password: 'uma-senha-de-teste-comprida',
    },
  });
  assert.equal(login.statusCode, 200);
  const setCookie = login.headers['set-cookie'];
  assert.equal(typeof setCookie, 'string');
  assert.match(String(setCookie), /HttpOnly/i);
  assert.match(String(setCookie), /SameSite=Strict/i);
  const cookie = String(setCookie).split(';', 1)[0];

  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, 'admin@example.test');

  const sessions = await app.inject({ method: 'GET', url: '/api/auth/sessions', headers: { cookie } });
  assert.equal(sessions.statusCode, 200);
  assert.equal(sessions.json().data[0].current, true);

  const invalidRevocation = await app.inject({
    method: 'DELETE', url: '/api/auth/sessions/54eb359b-6fb4-4d51-8c07-8c55ac7efd65',
    headers: { cookie }, payload: { confirmation: 'outro-id' },
  });
  assert.equal(invalidRevocation.statusCode, 400);

  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  assert.equal(logout.statusCode, 204);
  assert.match(String(logout.headers['clear-site-data']), /cookies/);

  const revoked = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  assert.equal(revoked.statusCode, 401);
});
