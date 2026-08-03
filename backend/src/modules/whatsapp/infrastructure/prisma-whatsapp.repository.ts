import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type {
  StoredWhatsappConnection,
  WhatsappConnectionRepository,
} from '../domain/whatsapp-connection.js';
import type { WhatsappConnectionStatus } from '@noter/contracts';
import { WhatsappAlreadyConnectedError } from '../domain/whatsapp-connection.js';

const PRIMARY_ACCOUNT_IDENTIFIER = 'primary';

export class PrismaWhatsappConnectionRepository implements WhatsappConnectionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async find(workspaceId: string): Promise<StoredWhatsappConnection | null> {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: {
        workspaceId_identifier: { workspaceId, identifier: PRIMARY_ACCOUNT_IDENTIFIER },
      },
    });
    return account ? toStoredConnection(account) : null;
  }

  public async markSetupStarted(workspaceId: string): Promise<StoredWhatsappConnection> {
    return this.updateState(workspaceId, 'qr_generated', null);
  }

  public async markConnected(workspaceId: string, phoneNumber: string): Promise<StoredWhatsappConnection> {
    return this.updateState(workspaceId, 'connected', phoneNumber);
  }

  public async resetAuthentication(
    workspaceId: string,
    accountId: string,
    actorUserId: string,
  ): Promise<StoredWhatsappConnection> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.whatsappAccount.findUnique({
        where: { workspaceId_id: { workspaceId, id: accountId } },
      });
      if (!current) throw new WhatsappAccountBindingNotFoundError();
      if (current.connectionStatus === 'connected') throw new WhatsappAlreadyConnectedError();

      await transaction.whatsappAuthKey.deleteMany({ where: { workspaceId, accountId } });
      const account = await transaction.whatsappAccount.update({
        where: { workspaceId_id: { workspaceId, id: accountId } },
        data: { connectionStatus: 'disconnected', phoneNumber: null },
      });
      await transaction.auditEvent.create({
        data: {
          workspaceId,
          userId: actorUserId,
          action: 'whatsapp_auth_reset',
          changedFields: ['whatsappAuthentication', 'phoneNumber'],
        },
      });
      await createConnectionEvent(transaction, workspaceId, account.id, 'disconnected');
      return toStoredConnection(account);
    }, { isolationLevel: 'Serializable' });
  }

  public async markStatus(
    workspaceId: string,
    accountId: string,
    status: Extract<WhatsappConnectionStatus, 'disconnected' | 'qr_generated' | 'connecting' | 'timeout'>,
  ): Promise<StoredWhatsappConnection> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.whatsappAccount.findUnique({
        where: { workspaceId_id: { workspaceId, id: accountId } },
      });
      if (!current) throw new WhatsappAccountBindingNotFoundError();
      if (current.connectionStatus === status) return toStoredConnection(current);
      const account = await transaction.whatsappAccount.update({
        where: { workspaceId_id: { workspaceId, id: accountId } },
        data: { connectionStatus: status },
      });
      await createConnectionEvent(transaction, workspaceId, account.id, status);
      return toStoredConnection(account);
    });
  }

  private async updateState(
    workspaceId: string,
    status: 'qr_generated' | 'connected',
    phoneNumber: string | null,
  ): Promise<StoredWhatsappConnection> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.whatsappAccount.findUnique({
        where: { workspaceId_identifier: { workspaceId, identifier: PRIMARY_ACCOUNT_IDENTIFIER } },
      });
      if (current?.connectionStatus === status && current.phoneNumber === phoneNumber) {
        return toStoredConnection(current);
      }
      const account = await transaction.whatsappAccount.upsert({
        where: {
          workspaceId_identifier: { workspaceId, identifier: PRIMARY_ACCOUNT_IDENTIFIER },
        },
        create: { workspaceId, identifier: PRIMARY_ACCOUNT_IDENTIFIER, connectionStatus: status, phoneNumber },
        update: {
          connectionStatus: status,
          phoneNumber,
          ...(status === 'connected' ? { lastConnectedAt: new Date() } : {}),
        },
      });
      await createConnectionEvent(transaction, workspaceId, account.id, status);
      return toStoredConnection(account);
    });
  }
}

async function createConnectionEvent(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  accountId: string,
  status: WhatsappConnectionStatus,
): Promise<void> {
  await transaction.outboxEvent.create({
    data: {
      workspaceId,
      aggregateType: 'whatsapp_account',
      aggregateId: accountId,
      eventType: 'whatsapp.connection.changed',
      payload: { workspaceId, accountId, status },
    },
  });
}

export class WhatsappAccountBindingNotFoundError extends Error {}

function toStoredConnection(account: {
  id: string;
  connectionStatus: StoredWhatsappConnection['status'];
  phoneNumber: string | null;
  updatedAt: Date;
}): StoredWhatsappConnection {
  return {
    accountId: account.id,
    status: account.connectionStatus,
    phoneNumber: account.phoneNumber,
    updatedAt: account.updatedAt.toISOString(),
  };
}
