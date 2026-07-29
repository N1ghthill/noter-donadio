import { useState } from 'react';

import { api } from '../api/client.js';
import { AudioPlayer } from './AudioPlayer.js';

export function MediaPreview(props: {
  messageId: string;
  messageType: 'audio' | 'image' | 'document';
  fileName: string;
}) {
  const [source, setSource] = useState<string>();
  const [expiresAt, setExpiresAt] = useState<string>();
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
      setExpiresAt(access.expiresAt);
    } catch {
      setError('O arquivo não está mais disponível.');
    } finally {
      setLoading(false);
    }
  }

  if (props.messageType === 'image' && source) {
    return (
      <div className="image-preview">
        <img
          src={source}
          alt={`Pré-visualização de ${props.fileName}`}
          loading="lazy"
          onError={() => {
            setSource(undefined);
            setExpiresAt(undefined);
            setError('O acesso à imagem expirou. Carregue-a novamente.');
          }}
        />
        <a href={source} target="_blank" rel="noreferrer">Abrir imagem</a>
        <button className="button-link media-renew" type="button" onClick={() => void prepare()}>
          Renovar acesso
        </button>
      </div>
    );
  }

  return (
    <div className="media-action">
      {source ? (
        <>
          <a className="button secondary" href={source} download={props.fileName}>
            Baixar documento
          </a>
          <button className="button-link media-renew" type="button" onClick={() => void prepare()}>
            Renovar acesso
          </button>
          {expiresAt ? <small>Acesso temporário preparado.</small> : null}
        </>
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
