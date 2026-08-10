import type {
  InboundMessageNotifier,
  NotificationVariant,
} from '../domain/inbound-message-notification.js';

const NOTIFICATION_GROUP = 'Construção Financiada 360';
const NOTIFICATION_COPY: Readonly<Record<NotificationVariant, {
  title: string;
  body: string;
}>> = {
  message_received: {
    title: 'Nova mensagem no WhatsApp',
    body: 'Uma mensagem recebida foi organizada no CRM.',
  },
  new_lead_identified: {
    title: 'Novo lead identificado pela IA',
    body: 'A identificação e as sugestões estão prontas para sua revisão.',
  },
  analysis_ready: {
    title: 'Análise da IA concluída',
    body: 'O contexto e as sugestões do atendimento estão prontos para revisão.',
  },
  analysis_attention: {
    title: 'Análise precisa de atenção',
    body: 'A etapa de IA não foi concluída. Abra o CRM para revisar.',
  },
  transcription_attention: {
    title: 'Áudio precisa de atenção',
    body: 'A transcrição automática não foi concluída. Abra o CRM para revisar.',
  },
};

export type NotificationFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class BarkNotifier implements InboundMessageNotifier {
  public constructor(
    private readonly webhookUrl: string,
    private readonly openUrl: string,
    private readonly fetchImplementation: NotificationFetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  public async notify(variant: NotificationVariant): Promise<void> {
    const copy = NOTIFICATION_COPY[variant];
    let response: Response;
    try {
      response = await this.fetchImplementation(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          title: copy.title,
          body: copy.body,
          group: NOTIFICATION_GROUP,
          level: 'active',
          url: this.openUrl,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new BarkNotificationError('BARK_REQUEST_FAILED');
    }

    if (!response.ok) throw new BarkNotificationError('BARK_HTTP_ERROR');
    const result = await safeJson(response);
    if (result?.code !== undefined && result.code !== 200) {
      throw new BarkNotificationError('BARK_REJECTED');
    }
  }
}

export class BarkNotificationError extends Error {
  public constructor(public readonly code: string) {
    super('Falha sanitizada no webhook Bark');
    this.name = 'BarkNotificationError';
  }
}

async function safeJson(response: Response): Promise<{ code?: unknown } | null> {
  try {
    const value: unknown = await response.json();
    return typeof value === 'object' && value !== null ? value as { code?: unknown } : null;
  } catch {
    return null;
  }
}
