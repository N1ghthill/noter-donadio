import { Redis } from 'ioredis';

import {
  QrCodeUnavailableError,
  type EphemeralQrCode,
  type WhatsappGateway,
} from '../domain/whatsapp-connection.js';

const COMMAND_CHANNEL = 'noter:whatsapp:baileys:commands';
const QR_TTL_SECONDS = 60;
const QR_WAIT_ATTEMPTS = 60;
const QR_WAIT_INTERVAL_MS = 250;

interface SetupCommand {
  readonly type: 'start';
  readonly workspaceId: string;
  readonly accountId: string;
}

export class RedisBaileysGateway implements WhatsappGateway {
  public readonly adapter = 'baileys' as const;
  public readonly canSimulate = false;
  private readonly redis: Redis;

  public constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  }

  public async createQrCode(workspaceId: string, accountId: string): Promise<EphemeralQrCode> {
    await this.redis.del(qrKey(workspaceId, accountId));
    const command: SetupCommand = { type: 'start', workspaceId, accountId };
    await this.redis.publish(COMMAND_CHANNEL, JSON.stringify(command));
    for (let attempt = 0; attempt < QR_WAIT_ATTEMPTS; attempt += 1) {
      const qrCode = await this.currentQrCode(workspaceId, accountId);
      if (qrCode) return qrCode;
      await wait(QR_WAIT_INTERVAL_MS);
    }
    throw new QrCodeUnavailableError();
  }

  public async currentQrCode(workspaceId: string, accountId: string): Promise<EphemeralQrCode | null> {
    const stored = await this.redis.get(qrKey(workspaceId, accountId));
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as Partial<EphemeralQrCode>;
      if (typeof parsed.payload !== 'string' || typeof parsed.expiresAt !== 'string') return null;
      if (Date.parse(parsed.expiresAt) <= Date.now()) return null;
      return { payload: parsed.payload, expiresAt: parsed.expiresAt };
    } catch {
      return null;
    }
  }

  public async close(): Promise<void> {
    await this.redis.quit();
  }
}

export class RedisBaileysControl {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;

  public constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
  }

  public async subscribe(handler: (command: SetupCommand) => Promise<void>): Promise<void> {
    await this.subscriber.subscribe(COMMAND_CHANNEL);
    this.subscriber.on('message', (_channel: string, value: string) => {
      const command = parseCommand(value);
      if (command) void handler(command);
    });
  }

  public async storeQr(
    workspaceId: string,
    accountId: string,
    payload: string,
  ): Promise<EphemeralQrCode> {
    const qrCode = {
      payload,
      expiresAt: new Date(Date.now() + QR_TTL_SECONDS * 1_000).toISOString(),
    };
    await this.publisher.set(
      qrKey(workspaceId, accountId),
      JSON.stringify(qrCode),
      'EX',
      QR_TTL_SECONDS,
    );
    return qrCode;
  }

  public async clearQr(workspaceId: string, accountId: string): Promise<void> {
    await this.publisher.del(qrKey(workspaceId, accountId));
  }

  public async close(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}

function parseCommand(value: string): SetupCommand | null {
  try {
    const parsed = JSON.parse(value) as Partial<SetupCommand>;
    if (
      parsed.type !== 'start'
      || typeof parsed.workspaceId !== 'string'
      || typeof parsed.accountId !== 'string'
    ) return null;
    return { type: parsed.type, workspaceId: parsed.workspaceId, accountId: parsed.accountId };
  } catch {
    return null;
  }
}

function qrKey(workspaceId: string, accountId: string): string {
  return `noter:whatsapp:baileys:qr:${workspaceId}:${accountId}`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
