import { createHash, randomBytes } from 'node:crypto';

import type { ScryptPasswordHasher } from './password-hasher.js';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1_000;
const DUMMY_HASH = `scrypt$v1$131072$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;

export interface AuthenticatedUser {
  readonly userId: string;
  readonly workspaceId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: 'admin';
}

export interface StoredUser extends AuthenticatedUser {
  readonly passwordHash: string;
  readonly status: 'active' | 'disabled';
}

export interface StoredSession extends AuthenticatedUser {
  readonly sessionId: string;
  readonly lastSeenAt: Date;
}

export interface AuthRepository {
  findUser(workspaceSlug: string, email: string): Promise<StoredUser | null>;
  createSession(input: { userId: string; workspaceId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findActiveSession(tokenHash: string, now: Date): Promise<StoredSession | null>;
  touchSession(sessionId: string, now: Date): Promise<void>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

export interface SessionAuthenticator {
  authenticate(token: string | undefined): Promise<AuthenticatedUser | null>;
}

export class InvalidCredentialsError extends Error {}

export class AuthService implements SessionAuthenticator {
  public constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: ScryptPasswordHasher,
  ) {}

  public async login(workspaceSlug: string, email: string, password: string) {
    const user = await this.repository.findUser(workspaceSlug.trim().toLowerCase(), normalizeEmail(email));
    const passwordValid = await this.passwordHasher.verify(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || user.status !== 'active' || !passwordValid) throw new InvalidCredentialsError();

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.repository.createSession({
      userId: user.userId,
      workspaceId: user.workspaceId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });
    return { token, expiresAt, user: publicUser(user) };
  }

  public async authenticate(token: string | undefined): Promise<AuthenticatedUser | null> {
    if (!token || token.length < 40 || token.length > 100) return null;
    const now = new Date();
    const session = await this.repository.findActiveSession(hashSessionToken(token), now);
    if (!session) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1_000) {
      await this.repository.touchSession(session.sessionId, now);
    }
    return publicUser(session);
  }

  public async logout(token: string | undefined): Promise<void> {
    if (token) await this.repository.revokeSession(hashSessionToken(token), new Date());
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(user: AuthenticatedUser): AuthenticatedUser {
  return {
    userId: user.userId,
    workspaceId: user.workspaceId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}
