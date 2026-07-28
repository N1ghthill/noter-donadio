import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  MetaCloudAccountMapping,
  MetaCloudAccountMappingRepository,
} from '../domain/meta-cloud-ingestion.js';

const META_CLOUD_PROVIDER = 'meta_cloud_api';

export class PrismaMetaCloudAccountMappingRepository
implements MetaCloudAccountMappingRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async resolve(
    businessAccountId: string,
    phoneNumberId: string,
  ): Promise<MetaCloudAccountMapping | null> {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: {
        provider_providerPhoneNumberId: {
          provider: META_CLOUD_PROVIDER,
          providerPhoneNumberId: phoneNumberId,
        },
        providerBusinessAccountId: businessAccountId,
        connectionStatus: 'connected',
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    return account
      ? { workspaceId: account.workspaceId, whatsappAccountId: account.id }
      : null;
  }
}
