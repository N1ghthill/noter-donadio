import assert from 'node:assert/strict';
import test from 'node:test';

import { io as createClient, type Socket } from 'socket.io-client';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { attachRealtimeServer, cookieValue, workspaceRoom } from './realtime.server.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const VALID_TOKEN = 'valid-session-token-with-more-than-forty-characters';

class FakeSessionAuthenticator implements SessionAuthenticator {
  public async authenticate(token: string | undefined) {
    return token === VALID_TOKEN
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

test('socket autentica pelo cookie e entra somente na sala do workspace da sessão', async (context) => {
  const app = buildApp();
  const io = attachRealtimeServer(app, { sessionAuthenticator: new FakeSessionAuthenticator() });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const client = createClient(address, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie: `noter_session=${VALID_TOKEN}` },
  });
  context.after(async () => {
    client.close();
    await app.close();
  });

  await connected(client);

  const serverSocket = [...io.sockets.sockets.values()][0];
  assert.ok(serverSocket);
  assert.equal(serverSocket.data.user.workspaceId, WORKSPACE_ID);
  assert.equal(serverSocket.rooms.has(workspaceRoom(WORKSPACE_ID)), true);
});

test('socket recusa sessão inválida sem revelar detalhes', async (context) => {
  const app = buildApp();
  attachRealtimeServer(app, { sessionAuthenticator: new FakeSessionAuthenticator() });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const client = createClient(address, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie: 'noter_session=invalid' },
  });
  context.after(async () => {
    client.close();
    await app.close();
  });

  const error = await connectionError(client);
  assert.equal(error.message, 'unauthorized');
});

test('parser de cookie recusa valor malformado', () => {
  assert.equal(cookieValue('other=value; noter_session=%E0%A4%A', 'noter_session'), undefined);
});

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('socket_connection_timeout')), 2_000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error); });
  });
}

function connectionError(socket: Socket): Promise<Error> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('socket_error_timeout')), 2_000);
    socket.once('connect_error', (error) => { clearTimeout(timeout); resolve(error); });
  });
}
