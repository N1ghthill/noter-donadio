import { z } from 'zod';

import { createPrismaClient } from './config/database.js';
import { ScryptPasswordHasher } from './modules/auth/domain/password-hasher.js';
import { normalizeEmail } from './modules/auth/domain/auth.service.js';

const environment = z.object({
  DATABASE_URL: z.url(),
  ADMIN_WORKSPACE_SLUG: z.string().trim().min(1).max(100),
  ADMIN_WORKSPACE_NAME: z.string().trim().min(1).max(255),
  ADMIN_EMAIL: z.email().max(320),
  ADMIN_DISPLAY_NAME: z.string().trim().min(1).max(255),
  ADMIN_PASSWORD: z.string().min(12).max(256),
}).parse(process.env);

const prisma = createPrismaClient(environment.DATABASE_URL);
const workspace = await prisma.workspace.upsert({
  where: { slug: environment.ADMIN_WORKSPACE_SLUG.toLowerCase() },
  create: {
    slug: environment.ADMIN_WORKSPACE_SLUG.toLowerCase(),
    name: environment.ADMIN_WORKSPACE_NAME,
  },
  update: { name: environment.ADMIN_WORKSPACE_NAME },
});
const email = normalizeEmail(environment.ADMIN_EMAIL);
const existing = await prisma.user.findUnique({
  where: { workspaceId_email: { workspaceId: workspace.id, email } },
});

if (existing) {
  await prisma.$disconnect();
  throw new Error('Administrador já existe; nenhuma credencial foi alterada');
}

const passwordHash = await new ScryptPasswordHasher().hash(environment.ADMIN_PASSWORD);
const user = await prisma.user.create({
  data: {
    workspaceId: workspace.id,
    email,
    displayName: environment.ADMIN_DISPLAY_NAME,
    passwordHash,
    role: 'admin',
  },
  select: { id: true },
});

process.stdout.write(`Administrador criado com ID ${user.id}\n`);
await prisma.$disconnect();
