import type { NegotiationStage } from '@noter/contracts';

import type {
  AnalysisDecision,
  Contact,
  ConversationSummary,
  Negotiation,
  NegotiationDetail,
  SessionUser,
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
      'content-type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? 'request_failed');
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
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

  async negotiations(stage?: NegotiationStage) {
    const query = stage ? `?stage=${stage}` : '';
    return request<{ data: Negotiation[] }>(`/api/negotiations${query}`);
  },

  async negotiation(id: string) {
    return request<NegotiationDetail>(`/api/negotiations/${id}`);
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
    input: { stage: NegotiationStage; expectedVersion: number },
  ) {
    return request<Negotiation>(`/api/negotiations/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify(input),
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
