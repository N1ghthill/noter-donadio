import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { FakeDemoAudioProvisioner } from './fake-demo-audio.provisioner.js';
import { InvalidStorageKeyError, LocalMediaStorage, MediaTooLargeError } from './local-media-storage.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const MESSAGE_ID = '11b3f58b-4f89-47f2-93bc-89be57028a48';

test('provisiona WAV fictício em armazenamento privado e com retenção', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'noter-media-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const storage = new LocalMediaStorage(root, 20_000);
  const provisioner = new FakeDemoAudioProvisioner(storage, 30);
  const now = new Date('2026-07-21T12:00:00.000Z');

  const media = await provisioner.provision(WORKSPACE_ID, MESSAGE_ID, now);
  const path = join(root, WORKSPACE_ID, `${MESSAGE_ID}.wav`);
  const bytes = await readFile(path);

  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString(), 'WAVE');
  assert.equal(media.fileSizeBytes, 16_044);
  assert.equal(media.retentionUntil.toISOString(), '2026-08-20T12:00:00.000Z');
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test('bloqueia travessia de diretório e arquivos acima do limite', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'noter-media-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const storage = new LocalMediaStorage(root, 1_024);

  await assert.rejects(storage.write('../escape.wav', Buffer.alloc(1)), InvalidStorageKeyError);
  await assert.rejects(
    storage.write(`${WORKSPACE_ID}/${MESSAGE_ID}.wav`, Buffer.alloc(1_025)),
    MediaTooLargeError,
  );
});

test('lista somente tentativas .media regulares para reconciliação', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'noter-media-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const storage = new LocalMediaStorage(root, 20_000);
  const mediaKey = `${WORKSPACE_ID}/${MESSAGE_ID}.media`;
  const wavKey = `${WORKSPACE_ID}/${MESSAGE_ID}.wav`;
  await storage.write(mediaKey, Buffer.from('media'));
  await storage.write(wavKey, Buffer.from('wav'));
  const modifiedAt = new Date('2026-07-26T10:00:00.000Z');
  await utimes(join(root, mediaKey), modifiedAt, modifiedAt);

  const invalidDirectory = join(root, 'not-a-workspace');
  await mkdir(invalidDirectory);
  await writeFile(join(invalidDirectory, `${MESSAGE_ID}.media`), 'ignored');
  await symlink(join(root, mediaKey), join(root, WORKSPACE_ID, '22b3f58b-4f89-47f2-93bc-89be57028a48.media'));

  const candidates = await storage.listOrphanCandidates(10);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.storageKey, mediaKey);
  assert.equal(candidates[0]?.modifiedAt.toISOString(), modifiedAt.toISOString());
});
