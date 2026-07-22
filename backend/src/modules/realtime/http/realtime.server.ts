import { createAdapter } from '@socket.io/redis-adapter';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import { safeErrorContext } from '../../../config/logger.js';

export const REALTIME_EVENT_NAME = 'crm.updated';
const SESSION_REVALIDATION_MS = 60_000;

export function attachRealtimeServer(
  app: FastifyInstance,
  options: { sessionAuthenticator: SessionAuthenticator; redisUrl?: string | undefined },
): Server {
  const io = new Server(app.server, {
    path: '/socket.io',
    serveClient: false,
    transports: ['websocket', 'polling'],
  });
  const redisClients = options.redisUrl
    ? createRedisAdapter(io, options.redisUrl, (error) => {
        app.log.error(safeErrorContext(error), 'Falha na conexão Redis do servidor de tempo real');
      })
    : [];

  io.use(async (socket, next) => {
    try {
      const token = cookieValue(socket.request.headers.cookie, SESSION_COOKIE_NAME);
      const user = await options.sessionAuthenticator.authenticate(token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      await socket.join(workspaceRoom(user.workspaceId));
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const token = cookieValue(socket.request.headers.cookie, SESSION_COOKIE_NAME);
    const interval = setInterval(() => {
      void options.sessionAuthenticator.authenticate(token).then((user) => {
        if (!user) socket.disconnect(true);
      }).catch(() => socket.disconnect(true));
    }, SESSION_REVALIDATION_MS);
    interval.unref();
    socket.once('disconnect', () => clearInterval(interval));
  });

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await Promise.all(redisClients.map(async (client) => {
      if (client.status !== 'end') await client.quit();
    }));
  });

  return io;
}

export function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const prefix = `${name}=`;
  const encoded = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded.slice(prefix.length));
  } catch {
    return undefined;
  }
}

function createRedisAdapter(
  io: Server,
  redisUrl: string,
  onError: (error: unknown) => void,
): Redis[] {
  const publisher = new Redis(redisUrl);
  const subscriber = publisher.duplicate();
  publisher.on('error', onError);
  subscriber.on('error', onError);
  io.adapter(createAdapter(publisher, subscriber));
  return [publisher, subscriber];
}
