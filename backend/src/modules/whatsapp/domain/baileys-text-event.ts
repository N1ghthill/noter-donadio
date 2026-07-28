export interface BaileysAccountBinding {
  readonly workspaceId: string;
  readonly whatsappAccountId: string;
}

export interface BaileysTextEvent {
  readonly externalMessageId: string;
  readonly remoteJid: string;
  readonly fromMe: boolean;
  readonly phoneNumber: string;
  readonly displayName?: string | undefined;
  readonly text: string;
  readonly occurredAt: Date;
}

export interface NormalizedBaileysTextMessage extends BaileysAccountBinding {
  readonly externalMessageId: string;
  readonly remoteJid: string;
  readonly phoneNumber: string;
  readonly displayName?: string | undefined;
  readonly direction: 'inbound' | 'outbound';
  readonly messageType: 'text';
  readonly content: string;
  readonly occurredAt: Date;
  readonly metadata: Readonly<{
    source: 'baileys';
  }>;
}

export function normalizeBaileysTextEvent(
  binding: BaileysAccountBinding,
  event: BaileysTextEvent,
): NormalizedBaileysTextMessage | null {
  if (
    !event.externalMessageId
    || !event.text
    || !isDirectChat(event.remoteJid)
  ) {
    return null;
  }
  return {
    ...binding,
    externalMessageId: event.externalMessageId,
    remoteJid: event.remoteJid,
    phoneNumber: event.phoneNumber,
    ...(event.displayName ? { displayName: event.displayName } : {}),
    direction: event.fromMe ? 'outbound' : 'inbound',
    messageType: 'text',
    content: event.text,
    occurredAt: event.occurredAt,
    metadata: { source: 'baileys' },
  };
}

function isDirectChat(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}
