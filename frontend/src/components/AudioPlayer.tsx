import { useState } from 'react';

import { api } from '../api/client.js';

export function AudioPlayer(props: { messageId: string; playbackAvailable: boolean }) {
  const [source, setSource] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function loadAudio(): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const access = await api.mediaAccess(props.messageId);
      setSource(access.url);
    } catch {
      setError('O áudio não está mais disponível ou não pôde ser carregado.');
    } finally {
      setLoading(false);
    }
  }

  if (!props.playbackAvailable) {
    return <p className="media-unavailable">Áudio indisponível ou removido pela retenção.</p>;
  }

  if (!source) {
    return (
      <div className="audio-player">
        <button className="button secondary" type="button" disabled={loading} onClick={() => void loadAudio()}>
          {loading ? 'Carregando áudio…' : 'Carregar áudio'}
        </button>
        {error ? <small className="inline-error" role="alert">{error}</small> : null}
      </div>
    );
  }

  return (
    <div className="audio-player">
      <audio
        controls
        preload="metadata"
        src={source}
        onError={() => {
          setSource(undefined);
          setError('O acesso ao áudio expirou. Carregue-o novamente.');
        }}
      >
        Seu navegador não oferece reprodução de áudio.
      </audio>
      {error ? <small className="inline-error" role="alert">{error}</small> : null}
    </div>
  );
}
