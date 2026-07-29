import { z } from 'zod';

import { createPrismaClient } from './config/database.js';
import { normalizeEmail } from './modules/auth/domain/auth.service.js';
import { ScryptPasswordHasher } from './modules/auth/domain/password-hasher.js';

const environment = z.object({
  DATABASE_URL: z.url(),
  RESET_ADMIN_WORKSPACE: z.string().trim().min(1).max(100),
  RESET_ADMIN_EMAIL: z.email().max(320),
  RESET_ADMIN_PASSWORD: z.string().min(16).max(256),
}).parse(process.env);

const prisma = createPrismaClient(environment.DATABASE_URL);
try {
  const workspaceSlug = environment.RESET_ADMIN_WORKSPACE.toLowerCase();
  const email = normalizeEmail(environment.RESET_ADMIN_EMAIL);
  const user = await prisma.user.findFirst({
    where: {
      email,
      role: 'admin',
      workspace: { slug: workspaceSlug },
    },
    select: { id: true, workspaceId: true },
  });
  if (!user) throw new Error('Administrador configurado não foi encontrado');

  const passwordHash = await new ScryptPasswordHasher().hash(environment.RESET_ADMIN_PASSWORD);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, status: 'active' },
    }),
    prisma.session.updateMany({
      where: { userId: user.id, workspaceId: user.workspaceId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  process.stdout.write('Senha administrativa redefinida e sessões anteriores revogadas.\n');
} finally {
  await prisma.$disconnect();
}
