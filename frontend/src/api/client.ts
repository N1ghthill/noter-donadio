import type { NegotiationStage } from '@noter/contracts';

import type {
  AnalysisDecision,
  Contact,
  ContactFile,
  ConversationSummary,
  Dashboard,
  Negotiation,
  NegotiationDetail,
  ProductCapabilities,
  Paginated,
  SessionUser,
  SessionInfo,
  WorkspaceAuditEvent,
  ProcessingFailure,
  NotificationStatus,
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

  async processingFailures(limit = 50) {
    return request<{ data: ProcessingFailure[] }>(`/api/processing-failures?limit=${limit}`);
  },

  async notificationStatus() {
    return request<NotificationStatus>('/api/notifications/status');
  },

  async retryProcessing(failure: ProcessingFailure) {
    return request<{ status: 'queued' }>(
      `/api/processing-failures/${failure.kind}/${failure.messageId}/retry`,
      { method: 'POST', body: JSON.stringify({ confirmation: failure.messageId }) },
    );
  },

  async dashboard(periodDays: 30 | 90 | 365 = 30) {
    return request<Dashboard>(`/api/dashboard?periodDays=${periodDays}`);
  },

  async contacts(search?: string, page?: { limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (page?.limit !== undefined) params.set('limit', String(page.limit));
    if (page?.offset !== undefined) params.set('offset', String(page.offset));
    const query = params.size ? `?${params.toString()}` : '';
    return request<Paginated<Contact>>(`/api/contacts${query}`);
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

  async mergeContacts(targetContactId: string, sourceContactId: string) {
    return request<Contact>(`/api/contacts/${targetContactId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ sourceContactId, confirmation: sourceContactId }),
    });
  },

  async negotiations(filters?: {
    stage?: NegotiationStage;
    followUp?: 'overdue' | 'today' | 'upcoming' | 'missing';
    activeOnly?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.stage) params.set('stage', filters.stage);
    if (filters?.followUp) params.set('followUp', filters.followUp);
    if (filters?.activeOnly) params.set('activeOnly', 'true');
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
    const query = params.size ? `?${params.toString()}` : '';
    return request<Paginated<Negotiation>>(`/api/negotiations${query}`);
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

  async negotiation(
    id: string,
    messageScope: 'negotiation' | 'contact' = 'negotiation',
    messages?: { limit?: number; offset?: number },
  ) {
    const params = new URLSearchParams();
    if (messageScope === 'contact') params.set('messageScope', 'contact');
    if (messages?.limit !== undefined) params.set('messageLimit', String(messages.limit));
    if (messages?.offset !== undefined) params.set('messageOffset', String(messages.offset));
    const query = params.size ? `?${params.toString()}` : '';
    return request<NegotiationDetail>(`/api/negotiations/${id}${query}`);
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
      fileName: string;
      disposition: 'inline' | 'attachment';
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

  async resetWhatsappAuthentication(accountId: string) {
    return request<WhatsappConnection>('/api/whatsapp/session', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: accountId }),
    });
  },

  async simulateWhatsappConnection() {
    return request<WhatsappConnection>('/api/whatsapp/demo/connect', { method: 'POST' });
  },

  async conversations(filters?: {
    activityFrom?: string;
    activityTo?: string;
    stage?: NegotiationStage;
    aiStage?: NegotiationStage;
    contactId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.activityFrom) params.set('activityFrom', filters.activityFrom);
    if (filters?.activityTo) params.set('activityTo', filters.activityTo);
    if (filters?.stage) params.set('stage', filters.stage);
    if (filters?.aiStage) params.set('aiStage', filters.aiStage);
    if (filters?.contactId) params.set('contactId', filters.contactId);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
    const query = params.size ? `?${params.toString()}` : '';
    return request<Paginated<ConversationSummary>>(`/api/conversations${query}`);
  },

  async files(filters?: {
    contactId?: string;
    search?: string;
    fileType?: 'audio' | 'image' | 'document';
    direction?: 'inbound' | 'outbound';
    occurredFrom?: string;
    occurredTo?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.contactId) params.set('contactId', filters.contactId);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.fileType) params.set('fileType', filters.fileType);
    if (filters?.direction) params.set('direction', filters.direction);
    if (filters?.occurredFrom) params.set('occurredFrom', filters.occurredFrom);
    if (filters?.occurredTo) params.set('occurredTo', filters.occurredTo);
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
    const query = params.size ? `?${params.toString()}` : '';
    return request<Paginated<ContactFile>>(`/api/files${query}`);
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
