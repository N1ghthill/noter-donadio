import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { ConnectedWhatsappAccountRepository } from '../domain/demo-message.js';

const PRIMARY_ACCOUNT_IDENTIFIER = 'primary';

export class PrismaConnectedWhatsappAccountRepository implements ConnectedWhatsappAccountRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findConnectedAccountId(workspaceId: string): Promise<string | null> {
    const account = await this.prisma.whatsappAccount.findFirst({
      where: {
        workspaceId,
        identifier: PRIMARY_ACCOUNT_IDENTIFIER,
        connectionStatus: 'connected',
      },
      select: { id: true },
    });
    return account?.id ?? null;
  }
}
