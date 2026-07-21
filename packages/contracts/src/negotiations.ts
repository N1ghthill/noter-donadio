export const NEGOTIATION_STAGES = [
  'lead',
  'qualified',
  'proposal_sent',
  'in_negotiation',
  'on_hold',
  'closed_won',
  'closed_lost',
] as const;

export type NegotiationStage = (typeof NEGOTIATION_STAGES)[number];

export const CLOSED_NEGOTIATION_STAGES = [
  'closed_won',
  'closed_lost',
] as const satisfies readonly NegotiationStage[];

export function isActiveNegotiation(stage: NegotiationStage): boolean {
  return !CLOSED_NEGOTIATION_STAGES.some((closedStage) => closedStage === stage);
}

export interface AiNegotiationSuggestion {
  readonly stage?: NegotiationStage;
  readonly summary?: string;
  readonly valueInMinorUnits?: bigint;
  readonly currency?: string;
  readonly productInterest?: string;
  readonly nextActions: readonly string[];
}
