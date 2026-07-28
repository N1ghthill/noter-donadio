import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface AuthStateCiphertext {
  readonly encryptedData: Buffer;
  readonly iv: Buffer;
  readonly authTag: Buffer;
  readonly encryptionKeyVersion: number;
}

export class AuthStateCipher {
  public constructor(
    private readonly keys: ReadonlyMap<number, Uint8Array>,
    private readonly activeVersion: number,
  ) {
    if (!Number.isInteger(activeVersion) || activeVersion < 1) {
      throw new InvalidAuthStateKeyError();
    }
    for (const [version, key] of keys) {
      if (!Number.isInteger(version) || version < 1 || key.byteLength !== KEY_BYTES) {
        throw new InvalidAuthStateKeyError();
      }
    }
    if (!keys.has(activeVersion)) throw new InvalidAuthStateKeyError();
  }

  public encrypt(plaintext: Uint8Array, associatedData: string): AuthStateCiphertext {
    const key = this.key(this.activeVersion);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const encryptedData = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      encryptedData,
      iv,
      authTag: cipher.getAuthTag(),
      encryptionKeyVersion: this.activeVersion,
    };
  }

  public decrypt(ciphertext: AuthStateCiphertext, associatedData: string): Buffer {
    if (ciphertext.iv.byteLength !== IV_BYTES || ciphertext.authTag.byteLength !== AUTH_TAG_BYTES) {
      throw new InvalidAuthStateCiphertextError();
    }
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key(ciphertext.encryptionKeyVersion),
        ciphertext.iv,
        { authTagLength: AUTH_TAG_BYTES },
      );
      decipher.setAAD(Buffer.from(associatedData, 'utf8'));
      decipher.setAuthTag(ciphertext.authTag);
      return Buffer.concat([decipher.update(ciphertext.encryptedData), decipher.final()]);
    } catch {
      throw new InvalidAuthStateCiphertextError();
    }
  }

  private key(version: number): Buffer {
    const key = this.keys.get(version);
    if (!key) throw new UnknownAuthStateKeyVersionError();
    return Buffer.from(key);
  }
}

export function parseBase64EncryptionKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new InvalidAuthStateKeyError();
  const key = Buffer.from(value, 'base64');
  if (key.byteLength !== KEY_BYTES || key.toString('base64') !== value) {
    throw new InvalidAuthStateKeyError();
  }
  return key;
}

export class InvalidAuthStateKeyError extends Error {}
export class UnknownAuthStateKeyVersionError extends Error {}
export class InvalidAuthStateCiphertextError extends Error {}
