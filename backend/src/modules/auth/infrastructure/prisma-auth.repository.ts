import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  AuthRepository,
  StoredSession,
  StoredUser,
} from '../domain/auth.service.js';

export class PrismaAuthRepository implements AuthRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findUser(workspaceSlug: string, email: string): Promise<StoredUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, workspace: { slug: workspaceSlug } },
    });
    return user
      ? {
          userId: user.id,
          workspaceId: user.workspaceId,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          passwordHash: user.passwordHash,
        }
      : null;
  }

  public async createSession(input: {
    userId: string;
    workspaceId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.create({ data: input }),
      this.prisma.user.update({
        where: { id: input.userId },
        data: { lastLoginAt: new Date() },
      }),
    ]);
  }

  public async findActiveSession(tokenHash: string, now: Date): Promise<StoredSession | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { status: 'active' },
      },
      include: { user: true },
    });
    return session
      ? {
          sessionId: session.id,
          userId: session.user.id,
          workspaceId: session.workspaceId,
          email: session.user.email,
          displayName: session.user.displayName,
          role: session.user.role,
          lastSeenAt: session.lastSeenAt,
        }
      : null;
  }

  public async touchSession(sessionId: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: now } },
      data: { lastSeenAt: now },
    });
  }

  public async revokeSession(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  public async listActiveSessions(userId: string, workspaceId: string, now: Date) {
    return this.prisma.session.findMany({
      where: { userId, workspaceId, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, tokenHash: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  public async revokeSessionById(
    sessionId: string, userId: string, workspaceId: string, now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, workspaceId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count === 1;
  }
}
