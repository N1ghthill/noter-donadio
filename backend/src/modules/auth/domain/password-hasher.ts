import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

interface ScryptParameters {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly maxmem: number;
}

const DEFAULT_PARAMETERS: ScryptParameters = {
  N: 2 ** 17,
  r: 8,
  p: 1,
  maxmem: 192 * 1024 * 1024,
};

export class ScryptPasswordHasher {
  public constructor(private readonly parameters = DEFAULT_PARAMETERS) {}

  public async hash(password: string): Promise<string> {
    validatePasswordLength(password);
    const salt = randomBytes(16);
    const derivedKey = await derive(password, salt, this.parameters);
    return encode(this.parameters, salt, derivedKey);
  }

  public async verify(password: string, encodedHash: string): Promise<boolean> {
    try {
      validatePasswordLength(password);
      const parsed = decode(encodedHash);
      const actual = await derive(password, parsed.salt, parsed.parameters);
      return actual.length === parsed.expected.length && timingSafeEqual(actual, parsed.expected);
    } catch {
      return false;
    }
  }
}

function derive(password: string, salt: Buffer, parameters: ScryptParameters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function encode(parameters: ScryptParameters, salt: Buffer, hash: Buffer): string {
  return [
    'scrypt',
    'v1',
    String(parameters.N),
    String(parameters.r),
    String(parameters.p),
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

function decode(value: string): {
  parameters: ScryptParameters;
  salt: Buffer;
  expected: Buffer;
} {
  const [algorithm, version, rawN, rawR, rawP, rawSalt, rawHash] = value.split('$');
  if (
    algorithm !== 'scrypt' ||
    version !== 'v1' ||
    !rawN || !rawR || !rawP || !rawSalt || !rawHash
  ) {
    throw new Error('Hash de senha inválido');
  }
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (N < 2 ** 14 || N > 2 ** 18 || r < 8 || r > 16 || p < 1 || p > 10) {
    throw new Error('Parâmetros de scrypt fora do intervalo aceito');
  }
  return {
    parameters: { N, r, p, maxmem: Math.max(192 * 1024 * 1024, 128 * N * r + 1024) },
    salt: Buffer.from(rawSalt, 'base64url'),
    expected: Buffer.from(rawHash, 'base64url'),
  };
}

function validatePasswordLength(password: string): void {
  const length = Buffer.byteLength(password, 'utf8');
  if (length < 12 || length > 256) throw new RangeError('Senha fora do intervalo aceito');
}
