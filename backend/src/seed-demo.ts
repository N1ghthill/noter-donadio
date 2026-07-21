import { createHash } from 'node:crypto';

import { z } from 'zod';

import { createPrismaClient } from './config/database.js';

const environment = z.object({
  DATABASE_URL: z.url(),
  ADMIN_WORKSPACE_SLUG: z.string().trim().min(1).max(100),
}).parse(process.env);

const prisma = createPrismaClient(environment.DATABASE_URL);

try {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: environment.ADMIN_WORKSPACE_SLUG.toLowerCase() },
    select: { id: true },
  });

  const result = await prisma.$transaction(async (transaction) => {
    const existingContact = await transaction.contact.findFirst({
      where: {
        workspaceId: workspace.id,
        phoneNumber: '5571000000000',
      },
      orderBy: { createdAt: 'asc' },
    });
    const contact = existingContact
      ? await transaction.contact.update({
          where: { id: existingContact.id },
          data: {
            jid: 'demo-contact@s.whatsapp.net',
            displayName: 'Contato de demonstração',
            tags: ['demonstração', 'interessado'],
            notes: 'Registro fictício para validação local do MVP.',
            lastInteractionAt: new Date('2026-07-20T18:30:00.000Z'),
          },
        })
      : await transaction.contact.create({
          data: {
            workspaceId: workspace.id,
            jid: 'demo-contact@s.whatsapp.net',
            phoneNumber: '5571000000000',
            displayName: 'Contato de demonstração',
            tags: ['demonstração', 'interessado'],
            notes: 'Registro fictício para validação local do MVP.',
            source: 'manual',
            lastInteractionAt: new Date('2026-07-20T18:30:00.000Z'),
          },
        });

    const account = await transaction.whatsappAccount.upsert({
      where: {
        workspaceId_identifier: { workspaceId: workspace.id, identifier: 'demo-local' },
      },
      create: {
        workspaceId: workspace.id,
        identifier: 'demo-local',
        connectionStatus: 'disconnected',
      },
      update: {},
    });

    const existingNegotiation = await transaction.negotiation.findFirst({
      where: {
        workspaceId: workspace.id,
        contactId: contact.id,
        title: 'Projeto de demonstração',
      },
    });
    const negotiation = existingNegotiation ?? await transaction.negotiation.create({
      data: {
        workspaceId: workspace.id,
        contactId: contact.id,
        title: 'Projeto de demonstração',
        stage: 'qualified',
        value: '12500.00',
        currency: 'BRL',
        productInterest: 'Implantação do noter.donadio',
        sentiment: 'positive',
        priority: 2,
      },
    });

    const inbound = await upsertMessage(transaction, {
      workspaceId: workspace.id,
      accountId: account.id,
      contactId: contact.id,
      negotiationId: negotiation.id,
      externalId: 'demo-message-1',
      direction: 'inbound',
      type: 'text',
      content: 'Olá! Gostaria de entender como o pipeline pode organizar meus atendimentos.',
      occurredAt: new Date('2026-07-20T18:00:00.000Z'),
    });
    await upsertMessage(transaction, {
      workspaceId: workspace.id,
      accountId: account.id,
      contactId: contact.id,
      negotiationId: negotiation.id,
      externalId: 'demo-message-2',
      direction: 'outbound',
      type: 'text',
      content: 'Claro. Vou preparar uma demonstração focada no seu processo comercial.',
      occurredAt: new Date('2026-07-20T18:10:00.000Z'),
    });
    const audio = await upsertMessage(transaction, {
      workspaceId: workspace.id,
      accountId: account.id,
      contactId: contact.id,
      negotiationId: negotiation.id,
      externalId: 'demo-message-3',
      direction: 'inbound',
      type: 'audio',
      content: null,
      occurredAt: new Date('2026-07-20T18:30:00.000Z'),
    });

    await transaction.mediaAsset.upsert({
      where: { messageId: audio.id },
      create: {
        workspaceId: workspace.id,
        messageId: audio.id,
        durationSeconds: 18,
        mimeType: 'audio/ogg',
        transcriptionState: 'completed',
        transcriptionText: 'Podemos agendar uma apresentação para terça-feira à tarde?',
        transcriptionLanguage: 'pt-BR',
        transcriptionModel: 'demo-local',
        transcribedAt: new Date('2026-07-20T18:31:00.000Z'),
      },
      update: {},
    });

    await transaction.aiAnalysis.upsert({
      where: {
        messageId_analysisType_promptVersion: {
          messageId: inbound.id,
          analysisType: 'message_extraction',
          promptVersion: 'demo-v1',
        },
      },
      create: {
        workspaceId: workspace.id,
        messageId: inbound.id,
        negotiationId: negotiation.id,
        state: 'completed',
        summary: 'Contato interessado em organizar atendimentos comerciais e conhecer o produto.',
        sentiment: 'positive',
        objections: [],
        nextActions: ['Agendar demonstração para terça-feira à tarde'],
        suggestedTags: ['demonstração'],
        suggestedStage: 'proposal_sent',
        confidenceScore: '0.91',
        promptVersion: 'demo-v1',
        modelUsed: 'demo-local',
      },
      update: {},
    });

    return { contactId: contact.id, negotiationId: negotiation.id };
  });

  process.stdout.write(`Dados de demonstração prontos: contato ${result.contactId}, negociação ${result.negotiationId}\n`);
} finally {
  await prisma.$disconnect();
}

async function upsertMessage(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    workspaceId: string;
    accountId: string;
    contactId: string;
    negotiationId: string;
    externalId: string;
    direction: 'inbound' | 'outbound';
    type: 'text' | 'audio';
    content: string | null;
    occurredAt: Date;
  },
) {
  return transaction.message.upsert({
    where: {
      whatsappAccountId_externalMessageId: {
        whatsappAccountId: input.accountId,
        externalMessageId: input.externalId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      whatsappAccountId: input.accountId,
      externalMessageId: input.externalId,
      contactId: input.contactId,
      negotiationId: input.negotiationId,
      direction: input.direction,
      messageType: input.type,
      content: input.content,
      contentHash: input.content ? createHash('sha256').update(input.content).digest('hex') : null,
      occurredAt: input.occurredAt,
    },
    update: {},
  });
}
