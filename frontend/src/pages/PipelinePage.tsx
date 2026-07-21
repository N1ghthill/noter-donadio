import { NEGOTIATION_STAGES, type NegotiationStage } from '@noter/contracts';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { formatMoney, STAGE_LABELS } from '../lib/format.js';
import type { Negotiation } from '../types/api.js';

export function PipelinePage() {
  const [items, setItems] = useState<Negotiation[]>();
  const [draggedId, setDraggedId] = useState<string>();
  const [updatingId, setUpdatingId] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setItems((await api.negotiations()).data); }
    catch { setError('Não foi possível carregar o pipeline.'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function move(id: string, stage: NegotiationStage) {
    const currentItems = items;
    const current = currentItems?.find((item) => item.id === id);
    if (!currentItems || !current || current.stage === stage || updatingId) return;
    const snapshot = currentItems;
    setItems(currentItems.map((item) => item.id === id ? { ...item, stage, version: item.version + 1 } : item));
    setUpdatingId(id);
    setError(undefined);
    try {
      const updated = await api.updateNegotiationStage(id, { stage, expectedVersion: current.version });
      setItems((list) => list?.map((item) => item.id === id ? updated : item));
    } catch (caught: unknown) {
      setItems(snapshot);
      setError(caught instanceof ApiError && caught.status === 409
        ? 'A negociação foi alterada em outra sessão. O pipeline foi atualizado.'
        : 'Não foi possível mover a negociação. A alteração foi desfeita.');
      if (caught instanceof ApiError && caught.status === 409) await load();
    } finally {
      setUpdatingId(undefined);
    }
  }

  if (!items && !error) return <LoadingState label="Carregando pipeline…" />;
  if (!items) return <ErrorState message={error ?? 'Não foi possível carregar o pipeline.'} retry={() => void load()} />;

  return (
    <div className="page-stack pipeline-page">
      <header className="page-header">
        <div><p className="eyebrow">Oportunidades</p><h1>Pipeline</h1></div>
        <p>Arraste cada cartão para atualizar a etapa. Mudanças conflitantes são protegidas por versão.</p>
      </header>
      {error ? <ErrorState message={error} /> : null}
      <section className="kanban" aria-label="Pipeline de negociações">
        {NEGOTIATION_STAGES.map((stage) => {
          const stageItems = items.filter((item) => item.stage === stage);
          return (
            <div className="kanban-column" key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedId) void move(draggedId, stage); setDraggedId(undefined); }}>
              <header><span className={`stage-dot stage-${stage}`} /><h2>{STAGE_LABELS[stage]}</h2><strong>{stageItems.length}</strong></header>
              <div className="kanban-list">
                {stageItems.map((item) => (
                  <article className={`deal-card${updatingId === item.id ? ' updating' : ''}`} key={item.id} draggable={updatingId !== item.id} onDragStart={() => setDraggedId(item.id)} onDragEnd={() => setDraggedId(undefined)}>
                    <small>{item.contactName}</small>
                    <h3>{item.title ?? 'Negociação sem título'}</h3>
                    <strong>{formatMoney(item.value, item.currency)}</strong>
                    {item.sentiment ? <span className="sentiment">{item.sentiment}</span> : null}
                  </article>
                ))}
                {stageItems.length === 0 ? <p className="column-empty">Solte uma negociação aqui</p> : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
