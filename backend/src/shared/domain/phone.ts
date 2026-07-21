export function normalizePhoneNumber(value: string): string {
  const normalized = value.replace(/\D/g, '');

  if (normalized.length < 8 || normalized.length > 20) {
    throw new RangeError('Telefone fora do intervalo aceito');
  }

  return normalized;
}
