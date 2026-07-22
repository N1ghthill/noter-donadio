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

export const AUDIT_ACTION_LABELS = {
  contact_created: 'Contato criado manualmente',
  contact_updated: 'Contato atualizado',
  contact_deleted: 'Contato excluído',
  negotiation_created: 'Negociação criada manualmente',
  negotiation_updated: 'Negociação atualizada manualmente',
  negotiation_stage_changed: 'Etapa alterada manualmente',
  negotiation_follow_up_completed: 'Próxima ação concluída',
  analysis_accepted: 'Sugestão da IA aplicada',
  analysis_ignored: 'Sugestão da IA ignorada',
  workspace_exported: 'Workspace exportado',
} as const;

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  displayName: 'nome',
  phoneNumber: 'telefone',
  tags: 'tags',
  notes: 'observações',
  stage: 'etapa',
  contactId: 'contato',
  title: 'título',
  value: 'valor',
  expectedCloseDate: 'previsão de fechamento',
  productInterest: 'produto de interesse',
  nextAction: 'próxima ação',
  nextActionDueDate: 'prazo da próxima ação',
  closeReason: 'motivo do fechamento',
};

export function formatDateOnly(value: string | null): string {
  if (!value) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00.000Z`));
}

export function formatMoney(value: string | null, currency = 'BRL'): string {
  if (value === null) return 'Valor não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value));
}

export function formatDate(value: string | null): string {
  if (!value) return 'Sem interação registrada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
