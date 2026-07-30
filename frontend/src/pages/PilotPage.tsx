import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'noter-pilot-checklist-v1';

const PILOT_ITEMS = [
  {
    id: 'access',
    title: 'Acesso e sessão',
    description: 'Entrar, conferir o usuário e validar que uma segunda sessão pode ser revogada.',
    route: '/administracao',
    action: 'Abrir administração',
  },
  {
    id: 'whatsapp',
    title: 'Conexão do WhatsApp',
    description: 'Confirmar o estado conectado sem solicitar novo QR ou desconectar a sessão.',
    route: '/whatsapp',
    action: 'Ver conexão',
  },
  {
    id: 'conversation',
    title: 'Conversa e mídias',
    description: 'Conferir texto, áudio, imagem e documento, incluindo renovação do acesso temporário.',
    route: '/conversas?period=all',
    action: 'Abrir conversas',
  },
  {
    id: 'pipeline',
    title: 'Pipeline comercial',
    description: 'Criar uma oportunidade controlada, editar dados e mover a etapa manualmente.',
    route: '/pipeline',
    action: 'Abrir pipeline',
  },
  {
    id: 'follow-up',
    title: 'Follow-up',
    description: 'Definir, filtrar e concluir uma próxima ação, confirmando o histórico.',
    route: '/agenda',
    action: 'Abrir agenda',
  },
  {
    id: 'files',
    title: 'Arquivos por contato',
    description: 'Filtrar mídias, abrir o contexto comercial e conferir a data de retenção.',
    route: '/arquivos',
    action: 'Abrir arquivos',
  },
] as const;

type PilotItemId = typeof PILOT_ITEMS[number]['id'];

export function PilotPage() {
  const [completed, setCompleted] = useState<Set<PilotItemId>>(() => loadCompleted());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  }, [completed]);

  const completedCount = completed.size;
  const percentage = Math.round((completedCount / PILOT_ITEMS.length) * 100);

  function toggle(id: PilotItemId): void {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset(): void {
    if (!window.confirm('Reiniciar somente as marcações deste checklist neste navegador?')) return;
    setCompleted(new Set());
  }

  return (
    <div className="page-stack pilot-page">
      <header className="page-header">
        <div><p className="eyebrow">Homologação</p><h1>Piloto do cliente</h1></div>
        <p>Roteiro controlado para validar as jornadas principais sem enviar mensagens pelo aplicativo.</p>
      </header>

      <section className="panel pilot-progress" aria-labelledby="pilot-progress-title">
        <div>
          <p className="eyebrow">Progresso neste navegador</p>
          <h2 id="pilot-progress-title">{completedCount} de {PILOT_ITEMS.length} jornadas validadas</h2>
        </div>
        <progress
          className="progress-track"
          max={PILOT_ITEMS.length}
          value={completedCount}
          aria-label={`${percentage}% do checklist concluído`}
        />
        <div className="pilot-actions">
          <button className="button secondary" type="button" onClick={() => window.print()}>Imprimir roteiro</button>
          <button className="button-link danger" type="button" onClick={reset}>Reiniciar marcações</button>
        </div>
      </section>

      <section className="pilot-checklist" aria-label="Jornadas do piloto">
        {PILOT_ITEMS.map((item, index) => (
          <article className={completed.has(item.id) ? 'completed' : ''} key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={completed.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span>Jornada {index + 1}</span>
            </label>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <Link className="card-link" to={item.route}>{item.action}</Link>
          </article>
        ))}
      </section>

      <aside className="panel pilot-safety">
        <div><p className="eyebrow">Regras do piloto</p><h2>Uso controlado</h2></div>
        <ul>
          <li>Use somente contatos e conteúdos autorizados.</li>
          <li>Responda pelo próprio WhatsApp; o noter.donadio não envia mensagens.</li>
          <li>Não consolide contatos reais sem revisar as negociações ativas.</li>
          <li>Registre o horário e a jornada ao reportar qualquer falha.</li>
        </ul>
        <small>As marcações ficam apenas neste navegador e não alteram dados comerciais.</small>
      </aside>
    </div>
  );
}

function loadCompleted(): Set<PilotItemId> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Set();
    const validIds = new Set<string>(PILOT_ITEMS.map((item) => item.id));
    return new Set(parsed.filter((id): id is PilotItemId => typeof id === 'string' && validIds.has(id)));
  } catch {
    return new Set();
  }
}
