import type { proto } from 'baileys';

import type { EncryptedProviderReference } from '../../media/domain/media-storage.js';
import {
  AuthStateCipher,
} from './auth-state-cipher.js';

const FORMAT_VERSION = 1;

interface SerializedBaileysMediaReference {
  readonly version: typeof FORMAT_VERSION;
  readonly url?: string;
  readonly directPath?: string;
  readonly mediaKey: string;
}

export interface BaileysMediaReferenceBinding {
  readonly workspaceId: string;
  readonly accountId: string;
  readonly externalMessageId: string;
}

export interface BaileysMediaReference {
  readonly url?: string;
  readonly directPath?: string;
  readonly mediaKey: Uint8Array;
}

export class BaileysMediaReferenceCipher {
  public constructor(private readonly cipher: AuthStateCipher) {}

  public fromAudioMessage(
    message: proto.Message.IAudioMessage,
  ): BaileysMediaReference | null {
    const url = nonEmptyString(message.url);
    const directPath = nonEmptyString(message.directPath);
    if ((!url && !directPath) || !message.mediaKey?.byteLength) return null;
    return {
      ...(url ? { url } : {}),
      ...(directPath ? { directPath } : {}),
      mediaKey: message.mediaKey,
    };
  }

  public encrypt(
    reference: BaileysMediaReference,
    binding: BaileysMediaReferenceBinding,
  ): EncryptedProviderReference {
    const serialized: SerializedBaileysMediaReference = {
      version: FORMAT_VERSION,
      ...(reference.url ? { url: reference.url } : {}),
      ...(reference.directPath ? { directPath: reference.directPath } : {}),
      mediaKey: Buffer.from(reference.mediaKey).toString('base64'),
    };
    return this.cipher.encrypt(
      Buffer.from(JSON.stringify(serialized), 'utf8'),
      associatedData(binding),
    );
  }

  public decrypt(
    encrypted: EncryptedProviderReference,
    binding: BaileysMediaReferenceBinding,
  ): BaileysMediaReference {
    const plaintext = this.cipher.decrypt(
      encrypted,
      associatedData(binding),
    );
    let value: unknown;
    try {
      value = JSON.parse(plaintext.toString('utf8'));
    } catch {
      throw new InvalidBaileysMediaReferenceError();
    }
    if (!isSerializedReference(value)) throw new InvalidBaileysMediaReferenceError();
    const mediaKey = Buffer.from(value.mediaKey, 'base64');
    if (!mediaKey.byteLength || mediaKey.toString('base64') !== value.mediaKey) {
      throw new InvalidBaileysMediaReferenceError();
    }
    return {
      ...(value.url ? { url: value.url } : {}),
      ...(value.directPath ? { directPath: value.directPath } : {}),
      mediaKey,
    };
  }
}

export class InvalidBaileysMediaReferenceError extends Error {}

function associatedData(binding: BaileysMediaReferenceBinding): string {
  return [
    'noter-baileys-media',
    FORMAT_VERSION,
    binding.workspaceId,
    binding.accountId,
    binding.externalMessageId,
  ].join(':');
}

function nonEmptyString(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isSerializedReference(value: unknown): value is SerializedBaileysMediaReference {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SerializedBaileysMediaReference>;
  return candidate.version === FORMAT_VERSION
    && typeof candidate.mediaKey === 'string'
    && candidate.mediaKey.length > 0
    && (typeof candidate.url === 'string' || typeof candidate.directPath === 'string')
    && (candidate.url === undefined || candidate.url.length > 0)
    && (candidate.directPath === undefined || candidate.directPath.length > 0);
}
