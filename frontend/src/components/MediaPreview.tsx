import { useState } from 'react';

import { api } from '../api/client.js';
import { AudioPlayer } from './AudioPlayer.js';

export function MediaPreview(props: {
  messageId: string;
  messageType: 'audio' | 'image' | 'document';
  fileName: string;
}) {
  const [source, setSource] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  if (props.messageType === 'audio') {
    return <AudioPlayer messageId={props.messageId} playbackAvailable />;
  }

  async function prepare() {
    setLoading(true);
    setError(undefined);
    try {
      const access = await api.mediaAccess(props.messageId);
      setSource(access.url);
    } catch {
      setError('O arquivo não está mais disponível.');
    } finally {
      setLoading(false);
    }
  }

  if (props.messageType === 'image' && source) {
    return (
      <div className="image-preview">
        <img src={source} alt={`Pré-visualização de ${props.fileName}`} loading="lazy" />
        <a href={source} target="_blank" rel="noreferrer">Abrir imagem</a>
      </div>
    );
  }

  return (
    <div className="media-action">
      {source ? (
        <a className="button secondary" href={source} download={props.fileName}>
          Baixar documento
        </a>
      ) : (
        <button className="button secondary" type="button" disabled={loading} onClick={() => void prepare()}>
          {loading
            ? 'Preparando…'
            : props.messageType === 'image'
              ? 'Ver imagem'
              : 'Preparar download'}
        </button>
      )}
      {error ? <small className="inline-error" role="alert">{error}</small> : null}
    </div>
  );
}
