import { z } from 'zod';

import type {
  DownloadedMedia,
  MediaDownloader,
  MediaDownloadTarget,
} from '../domain/media-download.js';

const META_CLOUD_PROVIDER = 'meta_cloud_api';
const GRAPH_API_ORIGIN = 'https://graph.facebook.com';
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;
const mediaUrlSchema = z.object({ url: z.url() });

export class MetaCloudMediaDownloader implements MediaDownloader {
  public constructor(
    private readonly accessToken: string,
    private readonly graphApiVersion: string,
    private readonly maxBytes: number,
    private readonly timeoutMs = 15_000,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  public async download(target: MediaDownloadTarget): Promise<DownloadedMedia> {
    if (
      target.provider !== META_CLOUD_PROVIDER
      || !target.providerPhoneNumberId
    ) {
      throw new Error('meta_media_account_invalid');
    }

    const metadataUrl = new URL(
      `/${this.graphApiVersion}/${encodeURIComponent(target.externalMediaId)}`,
      GRAPH_API_ORIGIN,
    );
    metadataUrl.searchParams.set('phone_number_id', target.providerPhoneNumberId);
    const metadataResponse = await this.request(metadataUrl, 'application/json');
    if (!metadataResponse.ok) throw new Error('meta_media_metadata_failed');
    const metadataBytes = await readLimitedBody(metadataResponse, MAX_METADATA_BYTES);
    const parsed = mediaUrlSchema.safeParse(
      JSON.parse(new TextDecoder().decode(metadataBytes)) as unknown,
    );
    if (!parsed.success) throw new Error('meta_media_metadata_invalid');

    const mediaUrl = new URL(parsed.data.url);
    assertAllowedMediaUrl(mediaUrl);
    const mediaResponse = await this.downloadFollowingRedirects(mediaUrl);
    if (!mediaResponse.ok) throw new Error('meta_media_download_failed');
    const mimeType = normalizeContentType(mediaResponse.headers.get('content-type'));
    const bytes = await readLimitedBody(mediaResponse, this.maxBytes);
    return { bytes, mimeType, durationSeconds: null };
  }

  private async downloadFollowingRedirects(initialUrl: URL): Promise<Response> {
    let currentUrl = initialUrl;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      assertAllowedMediaUrl(currentUrl);
      const response = await this.request(currentUrl, 'audio/*');
      if (!isRedirect(response.status)) return response;
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS) {
        throw new Error('meta_media_redirect_invalid');
      }
      await response.body?.cancel();
      currentUrl = new URL(location, currentUrl);
    }
    throw new Error('meta_media_redirect_invalid');
  }

  private request(url: URL, accept: string): Promise<Response> {
    return this.fetchImplementation(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept,
        authorization: `Bearer ${this.accessToken}`,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}

function assertAllowedMediaUrl(url: URL): void {
  const hostname = url.hostname.toLowerCase();
  const allowedHost = hostname === 'lookaside.fbsbx.com' || hostname.endsWith('.fbcdn.net');
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || !allowedHost
  ) {
    throw new Error('meta_media_url_not_allowed');
  }
}

function normalizeContentType(value: string | null): string {
  const mimeType = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (!mimeType) throw new Error('meta_media_content_type_missing');
  return mimeType;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw new Error('meta_media_size_invalid');
    }
  }
  if (!response.body) throw new Error('meta_media_body_missing');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) throw new Error('meta_media_size_invalid');
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}
