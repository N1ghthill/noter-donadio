import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';

interface RealtimeContextValue {
  connected: boolean;
  revision: number;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const connectedBefore = useRef(false);

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
    });
    const reconcile = () => setRevision((value) => value + 1);
    socket.on('connect', () => {
      setConnected(true);
      if (connectedBefore.current) reconcile();
      connectedBefore.current = true;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('crm.updated', (event: unknown) => {
      if (isRealtimeEvent(event)) reconcile();
    });
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  const value = useMemo(() => ({ connected, revision }), [connected, revision]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime deve ser usado dentro de RealtimeProvider');
  return context;
}

function isRealtimeEvent(event: unknown): boolean {
  if (typeof event !== 'object' || event === null || !('type' in event)) return false;
  return event.type === 'contact.updated'
    || event.type === 'negotiation.stage.changed'
    || event.type === 'whatsapp.connection.changed'
    || event.type === 'message.persisted'
    || event.type === 'message.transcription.changed'
    || event.type === 'analysis.changed';
}
