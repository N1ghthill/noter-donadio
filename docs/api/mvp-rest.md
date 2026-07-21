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
- `PATCH /api/contacts/:id`: edita nome, telefone, tags e observações do contato;
- `GET /api/negotiations`: lista o pipeline, opcionalmente filtrado por `stage`;
- `GET /api/negotiations/:id`: retorna contato, até 100 mensagens cronológicas, mídia/transcrição e até 20 análises recentes;
- `PATCH /api/negotiations/:id/stage`: mudança manual com `expectedVersion` para controle de concorrência.

Uma versão desatualizada na mudança de estágio retorna `409 version_conflict`. O cliente deve recarregar a negociação antes de tentar novamente.

O detalhe nunca recebe `workspaceId` do navegador: o isolamento é derivado exclusivamente da sessão. A edição de contato produz `contact.updated` na outbox contendo somente IDs e nomes dos campos alterados, sem telefone, notas ou conteúdo.

## Processos do backend

```bash
npm run start -w @noter/backend
npm run start:outbox -w @noter/backend
npm run start:realtime -w @noter/backend
```

O processo da outbox publica `message.text.ingested`, `message.audio.ingested` e eventos de atualização do CRM nas filas correspondentes. Os jobs contêm IDs e metadados de roteamento, nunca o conteúdo integral da conversa.

O protocolo de atualização e seus contratos sanitizados estão documentados em [`docs/realtime/events.md`](../realtime/events.md).
