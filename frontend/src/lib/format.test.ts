import { describe, expect, it } from 'vitest';

import { formatDate, formatMoney } from './format.js';

describe('formatação da interface', () => {
  it('formata valores monetários em português', () => {
    expect(formatMoney('1250.5', 'BRL')).toContain('1.250,50');
  });

  it('explica valores e datas ausentes', () => {
    expect(formatMoney(null)).toBe('Valor não informado');
    expect(formatDate(null)).toBe('Sem interação registrada');
  });
});
