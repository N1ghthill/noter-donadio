import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RealtimeProvider, useRealtime } from './RealtimeContext.js';

const socketState = vi.hoisted(() => ({
  handlers: new Map<string, (...arguments_: unknown[]) => void>(),
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (name: string, handler: (...arguments_: unknown[]) => void) => socketState.handlers.set(name, handler),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: () => socketState.handlers.clear(),
  }),
}));

describe('reconciliação em tempo real', () => {
  it('incrementa a revisão em evento válido e após reconexão', () => {
    render(<RealtimeProvider><RealtimeProbe /></RealtimeProvider>);

    act(() => socketState.handlers.get('connect')?.());
    expect(screen.getByTestId('realtime')).toHaveTextContent('online:0');

    act(() => socketState.handlers.get('crm.updated')?.({ type: 'contact.updated' }));
    expect(screen.getByTestId('realtime')).toHaveTextContent('online:1');

    act(() => socketState.handlers.get('disconnect')?.());
    act(() => socketState.handlers.get('connect')?.());
    expect(screen.getByTestId('realtime')).toHaveTextContent('online:2');
  });

  it('ignora payload desconhecido', () => {
    render(<RealtimeProvider><RealtimeProbe /></RealtimeProvider>);
    act(() => socketState.handlers.get('crm.updated')?.({ type: 'message.content.exposed' }));
    expect(screen.getByTestId('realtime')).toHaveTextContent('offline:0');
  });
});

function RealtimeProbe() {
  const realtime = useRealtime();
  return <span data-testid="realtime">{realtime.connected ? 'online' : 'offline'}:{realtime.revision}</span>;
}
