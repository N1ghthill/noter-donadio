import type { WhatsappConnectionStatus } from '@noter/contracts';

export interface StoredWhatsappConnection {
  readonly accountId: string;
  readonly status: WhatsappConnectionStatus;
  readonly phoneNumber: string | null;
  readonly updatedAt: string;
}

export interface EphemeralQrCode {
  readonly payload: string;
  readonly expiresAt: string;
}

export interface WhatsappConnectionView {
  readonly accountId: string | null;
  readonly status: WhatsappConnectionStatus;
  readonly phoneNumber: string | null;
  readonly updatedAt: string | null;
  readonly qrCode: EphemeralQrCode | null;
  readonly adapter: 'fake';
  readonly canSimulate: true;
}

export interface WhatsappConnectionRepository {
  find(workspaceId: string): Promise<StoredWhatsappConnection | null>;
  markSetupStarted(workspaceId: string): Promise<StoredWhatsappConnection>;
  markConnected(workspaceId: string, phoneNumber: string): Promise<StoredWhatsappConnection>;
}

export interface WhatsappGateway {
  createQrCode(workspaceId: string): Promise<EphemeralQrCode>;
  currentQrCode(workspaceId: string): Promise<EphemeralQrCode | null>;
  simulateScan(workspaceId: string): Promise<{ phoneNumber: string }>;
}

export class QrCodeUnavailableError extends Error {}

export class WhatsappConnectionService {
  public constructor(
    private readonly repository: WhatsappConnectionRepository,
    private readonly gateway: WhatsappGateway,
  ) {}

  public async get(workspaceId: string): Promise<WhatsappConnectionView> {
    const stored = await this.repository.find(workspaceId);
    if (!stored) return disconnectedView();
    return this.toView(workspaceId, stored);
  }

  public async startSetup(workspaceId: string): Promise<WhatsappConnectionView> {
    const qrCode = await this.gateway.createQrCode(workspaceId);
    const stored = await this.repository.markSetupStarted(workspaceId);
    return { ...toStoredView(stored), qrCode, adapter: 'fake', canSimulate: true };
  }

  public async simulateScan(workspaceId: string): Promise<WhatsappConnectionView> {
    const result = await this.gateway.simulateScan(workspaceId);
    const stored = await this.repository.markConnected(workspaceId, result.phoneNumber);
    return { ...toStoredView(stored), qrCode: null, adapter: 'fake', canSimulate: true };
  }

  private async toView(
    workspaceId: string,
    stored: StoredWhatsappConnection,
  ): Promise<WhatsappConnectionView> {
    const qrCode = stored.status === 'qr_generated'
      ? await this.gateway.currentQrCode(workspaceId)
      : null;
    return { ...toStoredView(stored), qrCode, adapter: 'fake', canSimulate: true };
  }
}

function disconnectedView(): WhatsappConnectionView {
  return {
    accountId: null,
    status: 'disconnected',
    phoneNumber: null,
    updatedAt: null,
    qrCode: null,
    adapter: 'fake',
    canSimulate: true,
  };
}

function toStoredView(stored: StoredWhatsappConnection) {
  return {
    accountId: stored.accountId,
    status: stored.status,
    phoneNumber: stored.phoneNumber,
    updatedAt: stored.updatedAt,
  };
}
