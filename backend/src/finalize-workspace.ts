import { z } from 'zod';

import { createPrismaClient } from './config/database.js';
import { normalizeEmail } from './modules/auth/domain/auth.service.js';
import { ScryptPasswordHasher } from './modules/auth/domain/password-hasher.js';

const environment = z.object({
  DATABASE_URL: z.url(),
  FINALIZE_SOURCE_WORKSPACE: z.string().trim().min(1).max(100),
  FINALIZE_TARGET_WORKSPACE: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  FINALIZE_WORKSPACE_NAME: z.string().trim().min(1).max(255),
  FINALIZE_ADMIN_EMAIL: z.email().max(320),
  FINALIZE_ADMIN_DISPLAY_NAME: z.string().trim().min(1).max(255),
  FINALIZE_ADMIN_PASSWORD: z.string().min(16).max(256),
}).parse(process.env);

const prisma = createPrismaClient(environment.DATABASE_URL);
try {
  const sourceSlug = environment.FINALIZE_SOURCE_WORKSPACE.toLowerCase();
  const targetSlug = environment.FINALIZE_TARGET_WORKSPACE.toLowerCase();
  const targetEmail = normalizeEmail(environment.FINALIZE_ADMIN_EMAIL);
  const passwordHash = await new ScryptPasswordHasher().hash(
    environment.FINALIZE_ADMIN_PASSWORD,
  );
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.findUnique({
      where: { slug: sourceSlug },
      select: { id: true },
    });
    if (!workspace) throw new Error('Workspace de origem não encontrado');

    const conflictingWorkspace = await transaction.workspace.findUnique({
      where: { slug: targetSlug },
      select: { id: true },
    });
    if (conflictingWorkspace && conflictingWorkspace.id !== workspace.id) {
      throw new Error('Slug definitivo já pertence a outro workspace');
    }

    const administrators = await transaction.user.findMany({
      where: { workspaceId: workspace.id, role: 'admin' },
      orderBy: { createdAt: 'asc' },
      take: 2,
      select: { id: true },
    });
    if (administrators.length !== 1) {
      throw new Error('Finalização exige exatamente um administrador no workspace');
    }
    const administrator = administrators[0];
    if (!administrator) throw new Error('Administrador não encontrado');

    const conflictingEmail = await transaction.user.findFirst({
      where: {
        workspaceId: workspace.id,
        email: targetEmail,
        id: { not: administrator.id },
      },
      select: { id: true },
    });
    if (conflictingEmail) throw new Error('E-mail definitivo já pertence a outro usuário');

    await transaction.workspace.update({
      where: { id: workspace.id },
      data: { slug: targetSlug, name: environment.FINALIZE_WORKSPACE_NAME },
    });
    await transaction.user.update({
      where: { id: administrator.id },
      data: {
        email: targetEmail,
        displayName: environment.FINALIZE_ADMIN_DISPLAY_NAME,
        passwordHash,
        status: 'active',
      },
    });
    await transaction.session.updateMany({
      where: { workspaceId: workspace.id, userId: administrator.id, revokedAt: null },
      data: { revokedAt: now },
    });
  });
  process.stdout.write('Workspace e administrador finalizados; sessões anteriores revogadas.\n');
} finally {
  await prisma.$disconnect();
}
