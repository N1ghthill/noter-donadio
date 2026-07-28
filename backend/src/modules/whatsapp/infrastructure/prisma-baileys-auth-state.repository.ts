import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from 'baileys';

import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import {
  AuthStateCipher,
  type AuthStateCiphertext,
} from './auth-state-cipher.js';

const CREDS_CATEGORY = 'creds';
const CREDS_KEY_ID = 'state';

export interface BaileysAccountBinding {
  readonly workspaceId: string;
  readonly accountId: string;
}

export interface LoadedBaileysAuthState {
  readonly state: AuthenticationState;
  saveCreds(): Promise<void>;
}

interface AuthMutation {
  readonly category: string;
  readonly keyId: string;
  readonly value: unknown | null;
}

export class PrismaBaileysAuthStateRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: AuthStateCipher,
  ) {}

  public async load(binding: BaileysAccountBinding): Promise<LoadedBaileysAuthState> {
    await this.assertAccountBinding(binding);
    const creds = await this.read<AuthenticationCreds>(
      binding,
      CREDS_CATEGORY,
      CREDS_KEY_ID,
    ) ?? initAuthCreds();

    return {
      state: {
        creds,
        keys: {
          get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
            const records = await this.prisma.whatsappAuthKey.findMany({
              where: {
                workspaceId: binding.workspaceId,
                accountId: binding.accountId,
                category: type,
                keyId: { in: ids },
              },
            });
            const values: Partial<Record<string, SignalDataTypeMap[T]>> = {};
            for (const record of records) {
              values[record.keyId] = await this.decodeSignalValue(type, binding, record);
            }
            return values as Record<string, SignalDataTypeMap[T]>;
          },
          set: async (data: SignalDataSet) => {
            const mutations: AuthMutation[] = [];
            for (const category of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
              const values = data[category];
              if (!values) continue;
              for (const [keyId, value] of Object.entries(values)) {
                mutations.push({ category, keyId, value });
              }
            }
            await this.writeMutations(binding, mutations);
          },
          clear: async () => {
            await this.prisma.whatsappAuthKey.deleteMany({
              where: {
                workspaceId: binding.workspaceId,
                accountId: binding.accountId,
                category: { not: CREDS_CATEGORY },
              },
            });
          },
        },
      },
      saveCreds: async () => {
        await this.writeMutations(binding, [{
          category: CREDS_CATEGORY,
          keyId: CREDS_KEY_ID,
          value: creds,
        }]);
      },
    };
  }

  private async assertAccountBinding(binding: BaileysAccountBinding): Promise<void> {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: binding.workspaceId,
          id: binding.accountId,
        },
      },
      select: { id: true },
    });
    if (!account) throw new BaileysAccountBindingNotFoundError();
  }

  private async read<T>(
    binding: BaileysAccountBinding,
    category: string,
    keyId: string,
  ): Promise<T | null> {
    const record = await this.prisma.whatsappAuthKey.findFirst({
      where: {
        workspaceId: binding.workspaceId,
        accountId: binding.accountId,
        category,
        keyId,
      },
    });
    if (!record) return null;
    return this.decode<T>(binding, record);
  }

  private async decodeSignalValue<T extends keyof SignalDataTypeMap>(
    category: T,
    binding: BaileysAccountBinding,
    record: StoredAuthRecord,
  ): Promise<SignalDataTypeMap[T]> {
    const value = this.decode<unknown>(binding, record);
    if (category === 'app-state-sync-key') {
      if (!isRecord(value)) throw new InvalidBaileysAuthStateError();
      return proto.Message.AppStateSyncKeyData.fromObject(value) as unknown as SignalDataTypeMap[T];
    }
    return value as SignalDataTypeMap[T];
  }

  private decode<T>(binding: BaileysAccountBinding, record: StoredAuthRecord): T {
    try {
      const plaintext = this.cipher.decrypt(toCiphertext(record), associatedData(
        binding,
        record.category,
        record.keyId,
      ));
      return JSON.parse(plaintext.toString('utf8'), BufferJSON.reviver) as T;
    } catch {
      throw new InvalidBaileysAuthStateError();
    }
  }

  private async writeMutations(
    binding: BaileysAccountBinding,
    mutations: readonly AuthMutation[],
  ): Promise<void> {
    const prepared = mutations.map((mutation) => ({
      ...mutation,
      ciphertext: mutation.value === null
        ? null
        : this.cipher.encrypt(
            Buffer.from(JSON.stringify(mutation.value, BufferJSON.replacer), 'utf8'),
            associatedData(binding, mutation.category, mutation.keyId),
          ),
    }));

    await this.prisma.$transaction(async (transaction) => {
      await assertAccountBinding(transaction, binding);
      for (const mutation of prepared) {
        if (!mutation.ciphertext) {
          await transaction.whatsappAuthKey.deleteMany({
            where: {
              workspaceId: binding.workspaceId,
              accountId: binding.accountId,
              category: mutation.category,
              keyId: mutation.keyId,
            },
          });
          continue;
        }
        await transaction.whatsappAuthKey.upsert({
          where: {
            accountId_category_keyId: {
              accountId: binding.accountId,
              category: mutation.category,
              keyId: mutation.keyId,
            },
          },
          create: {
            workspaceId: binding.workspaceId,
            accountId: binding.accountId,
            category: mutation.category,
            keyId: mutation.keyId,
            encryptedData: prismaBytes(mutation.ciphertext.encryptedData),
            iv: prismaBytes(mutation.ciphertext.iv),
            authTag: prismaBytes(mutation.ciphertext.authTag),
            encryptionKeyVersion: mutation.ciphertext.encryptionKeyVersion,
          },
          update: {
            encryptedData: prismaBytes(mutation.ciphertext.encryptedData),
            iv: prismaBytes(mutation.ciphertext.iv),
            authTag: prismaBytes(mutation.ciphertext.authTag),
            encryptionKeyVersion: mutation.ciphertext.encryptionKeyVersion,
          },
        });
      }
    });
  }
}

interface StoredAuthRecord {
  readonly category: string;
  readonly keyId: string;
  readonly encryptedData: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
  readonly encryptionKeyVersion: number;
}

function toCiphertext(record: StoredAuthRecord): AuthStateCiphertext {
  return {
    encryptedData: Buffer.from(record.encryptedData),
    iv: Buffer.from(record.iv),
    authTag: Buffer.from(record.authTag),
    encryptionKeyVersion: record.encryptionKeyVersion,
  };
}

function associatedData(
  binding: BaileysAccountBinding,
  category: string,
  keyId: string,
): string {
  return [
    'noter-baileys-auth-v1',
    binding.workspaceId,
    binding.accountId,
    category,
    keyId,
  ].join(':');
}

async function assertAccountBinding(
  transaction: Prisma.TransactionClient,
  binding: BaileysAccountBinding,
): Promise<void> {
  const account = await transaction.whatsappAccount.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: binding.workspaceId,
        id: binding.accountId,
      },
    },
    select: { id: true },
  });
  if (!account) throw new BaileysAccountBindingNotFoundError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

export class BaileysAccountBindingNotFoundError extends Error {}
export class InvalidBaileysAuthStateError extends Error {}
