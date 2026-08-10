import type {
  InboundMessageNotifier,
  NotificationVariant,
} from '../domain/inbound-message-notification.js';

const NOTIFICATION_COPY: Readonly<Record<NotificationVariant, {
  title: string;
  body: string;
  group: string;
  level: 'active' | 'passive' | 'timeSensitive';
  audience: 'commercial' | 'operational';
}>> = {
  message_received: {
    title: 'Atendimento recebido',
    body: 'A conversa foi salva no CRM e está sendo analisada. Nenhuma resposta foi enviada automaticamente.',
    group: 'Construção Financiada 360 · Atendimentos',
    level: 'passive',
    audience: 'commercial',
  },
  new_lead_identified: {
    title: 'Novo lead pronto para revisão',
    body: 'A IA identificou uma nova oportunidade. Toque para revisar e responder.',
    group: 'Construção Financiada 360 · Atendimentos',
    level: 'timeSensitive',
    audience: 'commercial',
  },
  analysis_ready: {
    title: 'Conversa analisada',
    body: 'O contexto e as sugestões estão disponíveis no CRM. Toque para revisar e responder.',
    group: 'Construção Financiada 360 · Atendimentos',
    level: 'active',
    audience: 'commercial',
  },
  analysis_attention: {
    title: 'Análise precisa de atenção',
    body: 'A análise não foi concluída após novas tentativas. Abra a Administração para revisar.',
    group: 'Construção Financiada 360 · Sistema',
    level: 'active',
    audience: 'operational',
  },
  transcription_attention: {
    title: 'Áudio precisa de atenção',
    body: 'A transcrição não foi concluída após novas tentativas. Abra a Administração para revisar.',
    group: 'Construção Financiada 360 · Sistema',
    level: 'active',
    audience: 'operational',
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
    private readonly operationalDestination?: {
      readonly webhookUrl: string;
      readonly openUrl: string;
    },
  ) {}

  public async notify(variant: NotificationVariant): Promise<void> {
    const copy = NOTIFICATION_COPY[variant];
    const destination = copy.audience === 'operational' && this.operationalDestination
      ? this.operationalDestination
      : { webhookUrl: this.webhookUrl, openUrl: this.openUrl };
    let response: Response;
    try {
      response = await this.fetchImplementation(destination.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          title: copy.title,
          body: copy.body,
          group: copy.group,
          level: copy.level,
          url: destination.openUrl,
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
