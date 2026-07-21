export const MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_TYPES = [
  'text',
  'audio',
  'image',
  'video',
  'document',
  'system_note',
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];
