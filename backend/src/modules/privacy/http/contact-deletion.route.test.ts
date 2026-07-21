import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import {
  ContactDeletionService,
  type ContactDeletionRepository,
} from '../domain/contact-deletion.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const USER_ID = 'd86e2931-7552-41f6-831f-85dd34c8bf29';
const CONTACT_ID = '3a3db76b-c51a-4584-ab4b-6d3e70952e44';
const SESSION_COOKIE = 'noter_session=valid-session-token-with-more-than-forty-characters';

const authenticator: SessionAuthenticator = {
  async authenticate(token) {
    return token ? {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      email: 'admin@example.invalid',
      displayName: 'Admin fictício',
      role: 'admin',
    } : null;
  },
};

test('exclusão exige confirmação do identificador e usa somente a identidade da sessão', async (context) => {
  let deletionInput: Parameters<ContactDeletionRepository['deleteContactAndScheduleMedia']>[0] | undefined;
  const repository: ContactDeletionRepository = {
    async deleteContactAndScheduleMedia(input) { deletionInput = input; return []; },
    async listPendingMedia() { return []; },
    async completeMediaDeletion() { return true; },
  };
  const app = buildApp({
    sessionAuthenticator: authenticator,
    contactDeletionService: new ContactDeletionService(repository, { async delete() {} }),
  });
  context.after(async () => app.close());
  const invalid = await app.inject({
    method: 'DELETE',
    url: `/api/contacts/${CONTACT_ID}`,
    headers: { cookie: SESSION_COOKIE },
    payload: { confirmation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  });
  assert.equal(invalid.statusCode, 400);

  const extra = await app.inject({
    method: 'DELETE',
    url: `/api/contacts/${CONTACT_ID}`,
    headers: { cookie: SESSION_COOKIE },
    payload: { confirmation: CONTACT_ID, workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  });
  assert.equal(extra.statusCode, 400);

  const valid = await app.inject({
    method: 'DELETE',
    url: `/api/contacts/${CONTACT_ID}`,
    headers: { cookie: SESSION_COOKIE },
    payload: { confirmation: CONTACT_ID },
  });
  assert.equal(valid.statusCode, 204);
  assert.deepEqual(deletionInput, { workspaceId: WORKSPACE_ID, userId: USER_ID, contactId: CONTACT_ID });
});

test('exclusão exige sessão ativa', async (context) => {
  const repository: ContactDeletionRepository = {
    async deleteContactAndScheduleMedia() { throw new Error('não deveria executar'); },
    async listPendingMedia() { return []; },
    async completeMediaDeletion() { return true; },
  };
  const app = buildApp({
    sessionAuthenticator: authenticator,
    contactDeletionService: new ContactDeletionService(repository, { async delete() {} }),
  });
  context.after(async () => app.close());
  const response = await app.inject({
    method: 'DELETE',
    url: `/api/contacts/${CONTACT_ID}`,
    payload: { confirmation: CONTACT_ID },
  });
  assert.equal(response.statusCode, 401);
});
