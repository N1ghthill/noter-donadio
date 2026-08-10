import assert from 'node:assert/strict';
import test from 'node:test';

import { BarkNotificationError, BarkNotifier, type NotificationFetch } from './bark-notifier.js';

test('envia somente texto estático e link interno no corpo JSON', async () => {
  let requestUrl: string | undefined;
  let requestInit: RequestInit | undefined;
  const fakeFetch: NotificationFetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ code: 200 }), { status: 200 });
  };
  const notifier = new BarkNotifier(
    'https://api.day.app/device-key',
    'https://leadcontrol.online/conversas',
    fakeFetch,
  );

  await notifier.notify('message_received');

  assert.equal(requestUrl, 'https://api.day.app/device-key');
  assert.equal(requestInit?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    title: 'Nova mensagem no WhatsApp',
    body: 'Uma mensagem recebida foi organizada no CRM.',
    group: 'Construção Financiada 360',
    level: 'active',
    url: 'https://leadcontrol.online/conversas',
  });
});

test('converte erro HTTP em código seguro sem propagar resposta externa', async () => {
  const notifier = new BarkNotifier(
    'https://api.day.app/device-key',
    'https://leadcontrol.online/conversas',
    async () => new Response('conteúdo externo sensível', { status: 503 }),
  );

  await assert.rejects(
    notifier.notify('analysis_attention'),
    (error: unknown) => error instanceof BarkNotificationError
      && error.code === 'BARK_HTTP_ERROR'
      && !error.message.includes('conteúdo externo sensível'),
  );
});

test('aceita resposta HTTP válida sem JSON', async () => {
  const notifier = new BarkNotifier(
    'https://api.day.app/device-key',
    'https://leadcontrol.online/conversas',
    async () => new Response(null, { status: 204 }),
  );
  await notifier.notify('analysis_ready');
});

test('distingue novo lead sem incluir dados da conversa', async () => {
  let requestBody: unknown;
  const notifier = new BarkNotifier(
    'https://api.day.app/device-key',
    'https://leadcontrol.online/conversas',
    async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ code: 200 }), { status: 200 });
    },
  );
  await notifier.notify('new_lead_identified');
  assert.deepEqual(requestBody, {
    title: 'Novo lead identificado pela IA',
    body: 'A identificação e as sugestões estão prontas para sua revisão.',
    group: 'Construção Financiada 360',
    level: 'active',
    url: 'https://leadcontrol.online/conversas',
  });
});
