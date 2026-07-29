import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import {
  WhatsappConnectionService,
  type StoredWhatsappConnection,
  type WhatsappConnectionRepository,
  type WhatsappGateway,
} from '../domain/whatsapp-connection.js';
import { FakeWhatsappGateway } from '../infrastructure/fake-whatsapp.gateway.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const ACCOUNT_ID = '2f31a180-6127-48cd-82da-7b324e49a31d';
const SESSION_COOKIE = 'noter_session=valid-session-token-with-more-than-forty-characters';

class FakeSessionAuthenticator implements SessionAuthenticator {
  public async authenticate(token: string | undefined) {
    return token === 'valid-session-token-with-more-than-forty-characters'
      ? {
          userId: 'd86e2931-7552-41f6-831f-85dd34c8bf29',
          workspaceId: WORKSPACE_ID,
          email: 'admin@example.test',
          displayName: 'Admin',
          role: 'admin' as const,
        }
      : null;
  }
}

class FakeConnectionRepository implements WhatsappConnectionRepository {
  public workspaceId?: string;
  private stored: StoredWhatsappConnection | null = null;

  public async find(workspaceId: string) {
    this.workspaceId = workspaceId;
    return this.stored;
  }

  public async markSetupStarted(workspaceId: string) {
    this.workspaceId = workspaceId;
    this.stored = connection('qr_generated', null);
    return this.stored;
  }

  public async markConnected(workspaceId: string, phoneNumber: string) {
    this.workspaceId = workspaceId;
    this.stored = connection('connected', phoneNumber);
    return this.stored;
  }

  public async markStatus(
    workspaceId: string,
    _accountId: string,
    status: Extract<StoredWhatsappConnection['status'], 'disconnected' | 'qr_generated' | 'connecting' | 'timeout'>,
  ) {
    this.workspaceId = workspaceId;
    this.stored = connection(status, this.stored?.phoneNumber ?? null);
    return this.stored;
  }
}

test('setup exige sessão e deriva workspace sem aceitar identificador do cliente', async (context) => {
  const repository = new FakeConnectionRepository();
  const app = buildApp({
    sessionAuthenticator: new FakeSessionAuthenticator(),
    whatsappService: new WhatsappConnectionService(repository, new FakeWhatsappGateway()),
  });
  context.after(async () => app.close());

  const unauthorized = await app.inject({ method: 'POST', url: '/api/whatsapp/setup' });
  assert.equal(unauthorized.statusCode, 401);

  const response = await app.inject({
    method: 'POST',
    url: '/api/whatsapp/setup',
    headers: { cookie: SESSION_COOKIE },
    payload: { workspaceId: 'workspace-forjado' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(repository.workspaceId, WORKSPACE_ID);
  assert.equal(response.json().status, 'qr_generated');
  assert.match(response.json().qrCode.payload, /^noter-demo:/);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('leitura simulada conecta apenas após QR válido', async (context) => {
  const service = new WhatsappConnectionService(
    new FakeConnectionRepository(),
    new FakeWhatsappGateway(),
  );
  const app = buildApp({
    sessionAuthenticator: new FakeSessionAuthenticator(),
    whatsappService: service,
  });
  context.after(async () => app.close());

  const unavailable = await app.inject({
    method: 'POST', url: '/api/whatsapp/demo/connect', headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(unavailable.statusCode, 409);

  await app.inject({ method: 'POST', url: '/api/whatsapp/setup', headers: { cookie: SESSION_COOKIE } });
  const connected = await app.inject({
    method: 'POST', url: '/api/whatsapp/demo/connect', headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(connected.statusCode, 200);
  assert.equal(connected.json().status, 'connected');
  assert.equal(connected.json().qrCode, null);

  const repeatedSetup = await app.inject({
    method: 'POST', url: '/api/whatsapp/setup', headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(repeatedSetup.statusCode, 409);
  assert.equal(repeatedSetup.json().error, 'already_connected');
});

test('contrato Baileys não expõe ação de simulação', async (context) => {
  const gateway: WhatsappGateway = {
    adapter: 'baileys',
    canSimulate: false,
    async createQrCode() {
      return {
        payload: 'qr-real-sintético',
        expiresAt: '2026-07-28T18:05:00.000Z',
      };
    },
    async currentQrCode() {
      return null;
    },
  };
  const app = buildApp({
    sessionAuthenticator: new FakeSessionAuthenticator(),
    whatsappService: new WhatsappConnectionService(new FakeConnectionRepository(), gateway),
  });
  context.after(async () => app.close());

  const connection = await app.inject({
    method: 'GET',
    url: '/api/whatsapp/connection',
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(connection.statusCode, 200);
  assert.equal(connection.json().adapter, 'baileys');
  assert.equal(connection.json().canSimulate, false);

  const simulation = await app.inject({
    method: 'POST',
    url: '/api/whatsapp/demo/connect',
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(simulation.statusCode, 404);
});

function connection(
  status: StoredWhatsappConnection['status'],
  phoneNumber: string | null,
): StoredWhatsappConnection {
  return {
    accountId: ACCOUNT_ID,
    status,
    phoneNumber,
    updatedAt: '2026-07-21T00:00:00.000Z',
  };
}
