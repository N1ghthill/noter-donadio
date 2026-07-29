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
  readonly adapter: 'fake' | 'baileys';
  readonly canSimulate: boolean;
}

export interface WhatsappConnectionRepository {
  find(workspaceId: string): Promise<StoredWhatsappConnection | null>;
  markSetupStarted(workspaceId: string): Promise<StoredWhatsappConnection>;
  markConnected(workspaceId: string, phoneNumber: string): Promise<StoredWhatsappConnection>;
  resetAuthentication(
    workspaceId: string,
    accountId: string,
    actorUserId: string,
  ): Promise<StoredWhatsappConnection>;
  markStatus(
    workspaceId: string,
    accountId: string,
    status: Extract<WhatsappConnectionStatus, 'disconnected' | 'qr_generated' | 'connecting' | 'timeout'>,
  ): Promise<StoredWhatsappConnection>;
}

export interface WhatsappGateway {
  readonly adapter: 'fake' | 'baileys';
  readonly canSimulate: boolean;
  createQrCode(workspaceId: string, accountId: string): Promise<EphemeralQrCode>;
  currentQrCode(workspaceId: string, accountId: string): Promise<EphemeralQrCode | null>;
  simulateScan?(workspaceId: string): Promise<{ phoneNumber: string }>;
}

export class QrCodeUnavailableError extends Error {}
export class WhatsappSimulationUnavailableError extends Error {}
export class WhatsappAlreadyConnectedError extends Error {}
export class WhatsappAuthenticationResetUnavailableError extends Error {}
export class WhatsappAccountNotFoundError extends Error {}

export class WhatsappConnectionService {
  public constructor(
    private readonly repository: WhatsappConnectionRepository,
    private readonly gateway: WhatsappGateway,
  ) {}

  public async get(workspaceId: string): Promise<WhatsappConnectionView> {
    const stored = await this.repository.find(workspaceId);
    if (!stored) return disconnectedView(this.gateway);
    return this.toView(workspaceId, stored);
  }

  public async startSetup(workspaceId: string): Promise<WhatsappConnectionView> {
    const current = await this.repository.find(workspaceId);
    if (current?.status === 'connected') throw new WhatsappAlreadyConnectedError();
    const stored = await this.repository.markSetupStarted(workspaceId);
    const qrCode = await this.gateway.createQrCode(workspaceId, stored.accountId);
    return { ...toStoredView(stored), qrCode, ...this.gatewayCapabilities() };
  }

  public async simulateScan(workspaceId: string): Promise<WhatsappConnectionView> {
    if (!this.gateway.simulateScan) throw new WhatsappSimulationUnavailableError();
    const result = await this.gateway.simulateScan(workspaceId);
    const stored = await this.repository.markConnected(workspaceId, result.phoneNumber);
    return { ...toStoredView(stored), qrCode: null, ...this.gatewayCapabilities() };
  }

  public async resetAuthentication(
    workspaceId: string,
    accountId: string,
    actorUserId: string,
  ): Promise<WhatsappConnectionView> {
    if (this.gateway.adapter !== 'baileys') {
      throw new WhatsappAuthenticationResetUnavailableError();
    }
    const current = await this.repository.find(workspaceId);
    if (!current || current.accountId !== accountId) throw new WhatsappAccountNotFoundError();
    if (current.status === 'connected') throw new WhatsappAlreadyConnectedError();
    const stored = await this.repository.resetAuthentication(workspaceId, accountId, actorUserId);
    return { ...toStoredView(stored), qrCode: null, ...this.gatewayCapabilities() };
  }

  private async toView(
    workspaceId: string,
    stored: StoredWhatsappConnection,
  ): Promise<WhatsappConnectionView> {
    const qrCode = stored.status === 'qr_generated'
      ? await this.gateway.currentQrCode(workspaceId, stored.accountId)
      : null;
    return { ...toStoredView(stored), qrCode, ...this.gatewayCapabilities() };
  }

  private gatewayCapabilities() {
    return {
      adapter: this.gateway.adapter,
      canSimulate: this.gateway.canSimulate,
    };
  }
}

function disconnectedView(gateway: WhatsappGateway): WhatsappConnectionView {
  return {
    accountId: null,
    status: 'disconnected',
    phoneNumber: null,
    updatedAt: null,
    qrCode: null,
    adapter: gateway.adapter,
    canSimulate: gateway.canSimulate,
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
