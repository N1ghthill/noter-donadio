import type { NegotiationStage } from '@noter/contracts';

import type {
  AnalysisDecision,
  Contact,
  ConversationSummary,
  Dashboard,
  Negotiation,
  NegotiationDetail,
  ProductCapabilities,
  SessionUser,
  SessionInfo,
  WorkspaceAuditEvent,
  WhatsappConnection,
} from '../types/api.js';

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? 'request_failed');
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function requestDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? 'request_failed');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] ?? 'noter-workspace-export.json';
  return { blob: await response.blob(), filename };
}

export const api = {
  async capabilities() {
    return request<ProductCapabilities>('/api/capabilities');
  },

  async login(input: { workspace: string; email: string; password: string }) {
    return request<{ user: SessionUser; expiresAt: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async me() {
    return request<{ user: SessionUser }>('/api/auth/me');
  },

  async logout() {
    return request<void>('/api/auth/logout', { method: 'POST' });
  },

  async sessions() {
    return request<{ data: SessionInfo[] }>('/api/auth/sessions');
  },

  async revokeSession(id: string) {
    return request<void>(`/api/auth/sessions/${id}`, {
      method: 'DELETE', body: JSON.stringify({ confirmation: id }),
    });
  },

  async workspaceExport() {
    return requestDownload('/api/privacy/workspace-export');
  },

  async auditEvents(limit = 50) {
    return request<{ data: WorkspaceAuditEvent[] }>(`/api/audit-events?limit=${limit}`);
  },

  async dashboard(periodDays: 30 | 90 | 365 = 30) {
    return request<Dashboard>(`/api/dashboard?periodDays=${periodDays}`);
  },

  async contacts(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<{ data: Contact[] }>(`/api/contacts${query}`);
  },

  async createContact(input: {
    displayName: string;
    phoneNumber: string;
    tags: string[];
    notes?: string;
  }) {
    return request<Contact>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateContact(id: string, input: {
    displayName?: string;
    phoneNumber?: string;
    tags?: string[];
    notes?: string | null;
  }) {
    return request<Contact>(`/api/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async deleteContact(id: string) {
    return request<void>(`/api/contacts/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: id }),
    });
  },

  async negotiations(filters?: {
    stage?: NegotiationStage;
    followUp?: 'overdue' | 'today' | 'upcoming' | 'missing';
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.stage) params.set('stage', filters.stage);
    if (filters?.followUp) params.set('followUp', filters.followUp);
    if (filters?.search) params.set('search', filters.search);
    const query = params.size ? `?${params.toString()}` : '';
    return request<{ data: Negotiation[] }>(`/api/negotiations${query}`);
  },

  async createNegotiation(input: {
    contactId: string;
    title?: string;
    stage: NegotiationStage;
    value?: string;
    expectedCloseDate?: string;
    productInterest?: string;
    nextAction?: string;
    nextActionDueDate?: string;
  }) {
    return request<Negotiation>('/api/negotiations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async negotiation(id: string) {
    return request<NegotiationDetail>(`/api/negotiations/${id}`);
  },

  async updateNegotiation(id: string, input: {
    expectedVersion: number;
    title?: string | null;
    value?: string | null;
    expectedCloseDate?: string | null;
    productInterest?: string | null;
    nextAction?: string | null;
    nextActionDueDate?: string | null;
  }) {
    return request<Negotiation>(`/api/negotiations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async mediaAccess(messageId: string) {
    return request<{
      url: string;
      expiresAt: string;
      mimeType: string;
      durationSeconds: number | null;
    }>(`/api/media/${messageId}/access`);
  },

  async updateNegotiationStage(
    id: string,
    input: { stage: NegotiationStage; expectedVersion: number; closeReason?: string },
  ) {
    return request<Negotiation>(`/api/negotiations/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async completeNextAction(id: string, expectedVersion: number) {
    return request<Negotiation>(`/api/negotiations/${id}/next-action/complete`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    });
  },

  async decideAnalysis(
    negotiationId: string,
    analysisId: string,
    input: {
      decisionId: string;
      decision: 'accepted' | 'ignored';
      expectedVersion: number;
      stage?: NegotiationStage;
      tags?: string[];
      value?: string;
      expectedCloseDate?: string;
      productInterest?: string;
      nextAction?: string;
      nextActionDueDate?: string;
    },
  ) {
    return request<AnalysisDecision>(`/api/negotiations/${negotiationId}/analyses/${analysisId}/decision`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async whatsappConnection() {
    return request<WhatsappConnection>('/api/whatsapp/connection');
  },

  async startWhatsappSetup() {
    return request<WhatsappConnection>('/api/whatsapp/setup', { method: 'POST' });
  },

  async simulateWhatsappConnection() {
    return request<WhatsappConnection>('/api/whatsapp/demo/connect', { method: 'POST' });
  },

  async conversations() {
    return request<{ data: ConversationSummary[] }>('/api/conversations');
  },

  async simulateInboundMessage(input: {
    clientMessageId: string;
    messageType?: 'text' | 'audio';
    content?: string;
  }) {
    return request<{ messageId: string; contactId: string; negotiationId: string; duplicate: boolean }>(
      '/api/whatsapp/demo/messages',
      { method: 'POST', body: JSON.stringify(input) },
    );
  },
};
