export const WHATSAPP_CONNECTION_STATUSES = [
  'disconnected',
  'qr_generated',
  'connecting',
  'connected',
  'timeout',
] as const;

export type WhatsappConnectionStatus = (typeof WHATSAPP_CONNECTION_STATUSES)[number];
