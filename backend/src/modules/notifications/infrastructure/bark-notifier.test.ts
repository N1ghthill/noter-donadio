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
    title: 'Atendimento recebido',
    body: 'A conversa foi salva no CRM e está sendo analisada. Nenhuma resposta foi enviada automaticamente.',
    group: 'Construção Financiada 360 · Atendimentos',
    level: 'passive',
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
    title: 'Novo lead pronto para revisão',
    body: 'A IA identificou uma nova oportunidade. Toque para revisar e responder.',
    group: 'Construção Financiada 360 · Atendimentos',
    level: 'timeSensitive',
    url: 'https://leadcontrol.online/conversas',
  });
});

test('separa alertas operacionais quando há um destino técnico configurado', async () => {
  let requestUrl: string | undefined;
  let requestBody: unknown;
  const notifier = new BarkNotifier(
    'https://api.day.app/client-key',
    'https://leadcontrol.online/conversas?period=today',
    async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ code: 200 }), { status: 200 });
    },
    10_000,
    {
      webhookUrl: 'https://api.day.app/operations-key',
      openUrl: 'https://leadcontrol.online/administracao',
    },
  );

  await notifier.notify('analysis_attention');

  assert.equal(requestUrl, 'https://api.day.app/operations-key');
  assert.deepEqual(requestBody, {
    title: 'Análise precisa de atenção',
    body: 'A análise não foi concluída após novas tentativas. Abra a Administração para revisar.',
    group: 'Construção Financiada 360 · Sistema',
    level: 'active',
    url: 'https://leadcontrol.online/administracao',
  });
});
