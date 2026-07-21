import type { MessageIngestionResult, MessageIngestionService } from './message-ingestion.js';

export interface ConnectedWhatsappAccountRepository {
  findConnectedAccountId(workspaceId: string): Promise<string | null>;
}

export interface SimulateInboundMessageCommand {
  readonly workspaceId: string;
  readonly clientMessageId: string;
  readonly messageType?: 'text' | 'audio' | undefined;
  readonly content?: string | undefined;
  readonly occurredAt?: Date | undefined;
}

export class DemoWhatsappNotConnectedError extends Error {
  public constructor() {
    super('A conexão simulada do WhatsApp não está ativa');
    this.name = 'DemoWhatsappNotConnectedError';
  }
}

export class DemoMessageService {
  public constructor(
    private readonly accounts: ConnectedWhatsappAccountRepository,
    private readonly ingestion: MessageIngestionService,
  ) {}

  public async simulateInbound(command: SimulateInboundMessageCommand): Promise<MessageIngestionResult> {
    const whatsappAccountId = await this.accounts.findConnectedAccountId(command.workspaceId);
    if (!whatsappAccountId) throw new DemoWhatsappNotConnectedError();

    const messageType = command.messageType ?? 'text';
    return this.ingestion.execute({
      workspaceId: command.workspaceId,
      whatsappAccountId,
      externalMessageId: `demo-${command.clientMessageId}`,
      remoteJid: 'demo-inbox@s.whatsapp.net',
      phoneNumber: '5571000000002',
      displayName: 'Contato simulado',
      direction: 'inbound',
      messageType,
      content: messageType === 'text' ? command.content : undefined,
      occurredAt: command.occurredAt ?? new Date(),
      metadata: { source: 'local_demo' },
    });
  }
}
