import { randomBytes } from 'node:crypto';

import {
  QrCodeUnavailableError,
  type EphemeralQrCode,
  type WhatsappGateway,
} from '../domain/whatsapp-connection.js';

const QR_LIFETIME_MS = 5 * 60 * 1_000;

export class FakeWhatsappGateway implements WhatsappGateway {
  public readonly adapter = 'fake' as const;
  public readonly canSimulate = true;
  private readonly qrCodes = new Map<string, EphemeralQrCode>();

  public async createQrCode(workspaceId: string): Promise<EphemeralQrCode> {
    const qrCode = {
      payload: `noter-demo:${randomBytes(24).toString('base64url')}`,
      expiresAt: new Date(Date.now() + QR_LIFETIME_MS).toISOString(),
    };
    this.qrCodes.set(workspaceId, qrCode);
    return qrCode;
  }

  public async currentQrCode(workspaceId: string): Promise<EphemeralQrCode | null> {
    const qrCode = this.qrCodes.get(workspaceId);
    if (!qrCode || Date.parse(qrCode.expiresAt) <= Date.now()) {
      this.qrCodes.delete(workspaceId);
      return null;
    }
    return qrCode;
  }

  public async simulateScan(workspaceId: string): Promise<{ phoneNumber: string }> {
    if (!await this.currentQrCode(workspaceId)) throw new QrCodeUnavailableError();
    this.qrCodes.delete(workspaceId);
    return { phoneNumber: '5571000000001' };
  }
}
