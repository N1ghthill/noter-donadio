import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  StoredWhatsappConnection,
  WhatsappConnectionRepository,
} from '../domain/whatsapp-connection.js';

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

  private async updateState(
    workspaceId: string,
    status: 'qr_generated' | 'connected',
    phoneNumber: string | null,
  ): Promise<StoredWhatsappConnection> {
    return this.prisma.$transaction(async (transaction) => {
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
      await transaction.outboxEvent.create({
        data: {
          workspaceId,
          aggregateType: 'whatsapp_account',
          aggregateId: account.id,
          eventType: 'whatsapp.connection.changed',
          payload: { workspaceId, accountId: account.id, status },
        },
      });
      return toStoredConnection(account);
    });
  }
}

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
