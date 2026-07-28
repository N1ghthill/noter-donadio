import type {
  MediaDownloader,
  MediaDownloadTarget,
} from '../domain/media-download.js';
import { createSyntheticSilentWav } from './fake-demo-audio.provisioner.js';

export class FakeMediaDownloader implements MediaDownloader {
  public async download(_target: MediaDownloadTarget) {
    return {
      bytes: createSyntheticSilentWav(),
      mimeType: 'audio/wav',
      durationSeconds: 1,
    };
  }
}
