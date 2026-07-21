export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return <div className="feedback" role="status"><span className="spinner" />{label}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="feedback error" role="alert">
      <span>{message}</span>
      {retry ? <button type="button" className="button secondary" onClick={retry}>Tentar novamente</button> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p></div>;
}
