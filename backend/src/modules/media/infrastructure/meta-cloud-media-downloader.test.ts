import assert from 'node:assert/strict';
import test from 'node:test';

import type { MediaDownloadTarget } from '../domain/media-download.js';
import { MetaCloudMediaDownloader } from './meta-cloud-media-downloader.js';

const target: MediaDownloadTarget = {
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  messageId: '71eb08da-e9a7-41a2-97bd-e1bd6780802b',
  attemptId: '91a408dd-6933-4d69-bcdb-93e1e23c03d5',
  externalMediaId: 'media/synthetic',
  expectedMimeType: 'audio/ogg',
  provider: 'meta_cloud_api',
  providerPhoneNumberId: 'phone-synthetic',
};

test('resolve URL e baixa mídia com token sem transportá-lo no endereço', async () => {
  const requests: Array<{ url: URL; authorization: string | null }> = [];
  const downloader = new MetaCloudMediaDownloader(
    'token-meta-sintetico-com-mais-de-trinta-e-dois-caracteres',
    'v99.0',
    1024,
    1000,
    async (input, init) => {
      const url = new URL(input.toString());
      const headers = new Headers(init?.headers);
      requests.push({ url, authorization: headers.get('authorization') });
      if (requests.length === 1) {
        return Response.json({
          url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/synthetic',
          ignored: 'field',
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'audio/ogg; codecs=opus' },
      });
    },
  );

  assert.deepEqual(await downloader.download(target), {
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'audio/ogg',
    durationSeconds: null,
  });
  assert.equal(requests[0]?.url.origin, 'https://graph.facebook.com');
  assert.equal(requests[0]?.url.pathname, '/v99.0/media%2Fsynthetic');
  assert.equal(requests[0]?.url.searchParams.get('phone_number_id'), 'phone-synthetic');
  assert.equal(requests[0]?.url.searchParams.has('access_token'), false);
  assert.equal(requests[1]?.url.hostname, 'lookaside.fbsbx.com');
  assert.ok(requests.every(({ authorization }) => authorization?.startsWith('Bearer ')));
});

test('recusa URL de download fora dos hosts controlados pela Meta', async () => {
  const downloader = new MetaCloudMediaDownloader(
    'token-meta-sintetico-com-mais-de-trinta-e-dois-caracteres',
    'v99.0',
    1024,
    1000,
    async () => Response.json({ url: 'https://internal.example.test/media' }),
  );

  await assert.rejects(
    () => downloader.download(target),
    /meta_media_url_not_allowed/,
  );
});

test('interrompe resposta cujo tamanho excede o limite configurado', async () => {
  let requestCount = 0;
  const downloader = new MetaCloudMediaDownloader(
    'token-meta-sintetico-com-mais-de-trinta-e-dois-caracteres',
    'v99.0',
    2,
    1000,
    async () => {
      requestCount += 1;
      return requestCount === 1
        ? Response.json({ url: 'https://lookaside.fbsbx.com/media' })
        : new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'audio/ogg', 'content-length': '3' },
        });
    },
  );

  await assert.rejects(
    () => downloader.download(target),
    /meta_media_size_invalid/,
  );
});

test('valida o host de cada redirecionamento antes de enviar o token', async () => {
  let requestCount = 0;
  const downloader = new MetaCloudMediaDownloader(
    'token-meta-sintetico-com-mais-de-trinta-e-dois-caracteres',
    'v99.0',
    1024,
    1000,
    async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return Response.json({ url: 'https://lookaside.fbsbx.com/media' });
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://internal.example.test/media' },
      });
    },
  );

  await assert.rejects(
    () => downloader.download(target),
    /meta_media_url_not_allowed/,
  );
  assert.equal(requestCount, 2);
});
