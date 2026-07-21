# API REST inicial do MVP

Estas rotas existem para integração do frontend durante a fundação. As rotas do CRM já usam sessão revogável de usuário.

## Cabeçalhos

- `x-internal-token`: usado somente por `POST /api/internal/messages/ingest`;
- cookie `noter_session`: enviado automaticamente pelo navegador nas rotas do CRM.

Nenhum token, telefone ou conteúdo deve aparecer em logs ou exemplos versionados.

## Rotas

- `POST /api/internal/messages/ingest`: ingestão idempotente de texto ou áudio;
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`: ciclo da sessão;
- `GET /api/contacts`: lista e busca contatos do workspace;
- `POST /api/contacts`: cria contato manual;
- `GET /api/negotiations`: lista o pipeline, opcionalmente filtrado por `stage`;
- `PATCH /api/negotiations/:id/stage`: mudança manual com `expectedVersion` para controle de concorrência.

Uma versão desatualizada na mudança de estágio retorna `409 version_conflict`. O cliente deve recarregar a negociação antes de tentar novamente.

## Processos do backend

```bash
npm run start -w @noter/backend
npm run start:outbox -w @noter/backend
```

O processo da outbox publica `message.text.ingested`, `message.audio.ingested` e eventos de atualização do CRM nas filas correspondentes. Os jobs contêm IDs e metadados de roteamento, nunca o conteúdo integral da conversa.
