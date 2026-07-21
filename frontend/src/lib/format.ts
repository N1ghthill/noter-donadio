import type { NegotiationStage, ProcessingState } from '@noter/contracts';

export const STAGE_LABELS: Record<NegotiationStage, string> = {
  lead: 'Lead',
  qualified: 'Qualificado',
  proposal_sent: 'Proposta enviada',
  in_negotiation: 'Em negociação',
  on_hold: 'Em espera',
  closed_won: 'Fechado ganho',
  closed_lost: 'Fechado perdido',
};

export const PROCESSING_LABELS: Record<ProcessingState, string> = {
  pending: 'aguardando',
  processing: 'processando',
  completed: 'concluída',
  failed: 'falhou',
};

export const SENTIMENT_LABELS = {
  positive: 'positivo',
  neutral: 'neutro',
  negative: 'negativo',
  urgent: 'urgente',
} as const;

export function formatMoney(value: string | null, currency = 'BRL'): string {
  if (value === null) return 'Valor não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value));
}

export function formatDate(value: string | null): string {
  if (!value) return 'Sem interação registrada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
}
