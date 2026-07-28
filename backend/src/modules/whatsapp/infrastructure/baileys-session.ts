import pino from 'pino';
import {
  DisconnectReason,
  makeWASocket,
  type WASocket,
} from 'baileys';
import type { Logger } from 'pino';

import type { MessageIngestionService } from '../../messages/domain/message-ingestion.js';
import {
  normalizeBaileysTextEvent,
  type BaileysAccountBinding as DomainBinding,
} from '../domain/baileys-text-event.js';
import type { PrismaBaileysAuthStateRepository } from './prisma-baileys-auth-state.repository.js';
import type { PrismaWhatsappConnectionRepository } from './prisma-whatsapp.repository.js';
import type { RedisBaileysControl } from './redis-baileys.gateway.js';
import { toBaileysTextEvent } from './baileys-message.js';

const RECONNECT_DELAY_MS = 2_000;

export interface BaileysSessionBinding {
  readonly workspaceId: string;
  readonly accountId: string;
}

export class BaileysSession {
  private socket: WASocket | undefined;
  private generation = 0;
  private restartChain: Promise<void> = Promise.resolve();
  private stopping = false;

  public constructor(
    private readonly binding: BaileysSessionBinding,
    private readonly authRepository: PrismaBaileysAuthStateRepository,
    private readonly connectionRepository: PrismaWhatsappConnectionRepository,
    private readonly ingestionService: MessageIngestionService,
    private readonly control: RedisBaileysControl,
    private readonly logger: Logger,
  ) {}

  public async run(): Promise<void> {
    await this.control.subscribe(async (command) => {
      if (
        command.workspaceId === this.binding.workspaceId
        && command.accountId === this.binding.accountId
      ) await this.restart();
    });
    await this.restart();
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    this.generation += 1;
    this.socket?.end(new Error('session_stopped'));
    this.socket = undefined;
    await this.restartChain;
  }

  private restart(): Promise<void> {
    this.restartChain = this.restartChain
      .catch(() => undefined)
      .then(() => this.openSocket());
    return this.restartChain;
  }

  private async openSocket(): Promise<void> {
    if (this.stopping) return;
    const generation = ++this.generation;
    this.socket?.end(new Error('session_restarted'));
    await this.control.clearQr(this.binding.workspaceId, this.binding.accountId);
    const auth = await this.authRepository.load(this.binding);
    const socket = makeWASocket({
      auth: auth.state,
      logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
    });
    this.socket = socket;

    socket.ev.on('creds.update', () => {
      void auth.saveCreds().catch((error: unknown) => {
        this.logger.error(safeError(error), 'Falha ao persistir credenciais do Baileys');
      });
    });
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify' || generation !== this.generation) return;
      for (const message of messages) void this.ingest(message);
    });
    socket.ev.on('connection.update', (update) => {
      if (generation !== this.generation) return;
      void this.handleConnectionUpdate(socket, update, generation).catch((error: unknown) => {
        this.logger.error(safeError(error), 'Falha ao tratar estado da sessão Baileys');
      });
    });
  }

  private async ingest(message: Parameters<typeof toBaileysTextEvent>[0]): Promise<void> {
    const event = toBaileysTextEvent(message);
    if (!event) return;
    const binding: DomainBinding = {
      workspaceId: this.binding.workspaceId,
      whatsappAccountId: this.binding.accountId,
    };
    const normalized = normalizeBaileysTextEvent(binding, event);
    if (!normalized) return;
    try {
      await this.ingestionService.execute(normalized);
    } catch (error: unknown) {
      this.logger.error(safeError(error), 'Falha ao persistir mensagem normalizada do Baileys');
    }
  }

  private async handleConnectionUpdate(
    socket: WASocket,
    update: Parameters<Parameters<WASocket['ev']['on']>[1]>[0] & {
      connection?: 'open' | 'close' | 'connecting';
      qr?: string;
      lastDisconnect?: { error?: unknown };
    },
    generation: number,
  ): Promise<void> {
    if (update.qr) {
      await this.control.storeQr(this.binding.workspaceId, this.binding.accountId, update.qr);
      await this.connectionRepository.markStatus(
        this.binding.workspaceId,
        this.binding.accountId,
        'qr_generated',
      );
    }
    if (update.connection === 'connecting' && !update.qr) {
      await this.connectionRepository.markStatus(
        this.binding.workspaceId,
        this.binding.accountId,
        'connecting',
      );
    }
    if (update.connection === 'open') {
      await this.control.clearQr(this.binding.workspaceId, this.binding.accountId);
      const phoneNumber = phoneFromJid(socket.user?.id);
      if (phoneNumber) {
        await this.connectionRepository.markConnected(this.binding.workspaceId, phoneNumber);
      }
      this.logger.info('Sessão Baileys conectada');
    }
    if (update.connection === 'close') {
      await this.control.clearQr(this.binding.workspaceId, this.binding.accountId);
      const statusCode = disconnectStatusCode(update.lastDisconnect?.error);
      const terminal = [
        DisconnectReason.loggedOut,
        DisconnectReason.badSession,
        DisconnectReason.forbidden,
        DisconnectReason.connectionReplaced,
      ].includes(statusCode as DisconnectReason);
      await this.connectionRepository.markStatus(
        this.binding.workspaceId,
        this.binding.accountId,
        statusCode === DisconnectReason.timedOut ? 'timeout' : 'disconnected',
      );
      if (!terminal && !this.stopping && generation === this.generation) {
        setTimeout(() => {
          if (!this.stopping && generation === this.generation) void this.restart();
        }, RECONNECT_DELAY_MS);
      }
    }
  }
}

function phoneFromJid(jid: string | undefined): string | null {
  if (!jid) return null;
  const value = jid.split(':', 1)[0]?.replace(/\D/g, '') ?? '';
  return value.length >= 8 && value.length <= 20 ? value : null;
}

function disconnectStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('output' in error && typeof error.output === 'object' && error.output !== null
    && 'statusCode' in error.output) {
    return Number(error.output.statusCode);
  }
  if ('statusCode' in error) return Number(error.statusCode);
  return undefined;
}

function safeError(error: unknown): { errorName: string } {
  return { errorName: error instanceof Error ? error.name : 'UnknownError' };
}
