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
- `GET /api/negotiations/:id`: retorna contato, até 100 mensagens cronológicas, mídia/transcrição, até 20 análises e até 50 ações auditadas recentes;
- `PATCH /api/negotiations/:id/stage`: mudança manual com `expectedVersion` para controle de concorrência.
- `POST /api/negotiations/:id/analyses/:analysisId/decision`: aceita uma seleção editável de etapa/tags ou ignora a sugestão, com UUID idempotente e `expectedVersion`.
- `GET /api/conversations`: lista até 50 conversas, usando a mensagem mais recente de cada negociação;
- `GET /api/whatsapp/connection`: consulta o estado da conta principal;
- `POST /api/whatsapp/setup`: inicia setup e retorna QR efêmero no adapter falso;
- `POST /api/whatsapp/demo/connect`: simula a leitura do QR, disponível somente quando o adapter falso está habilitado.
- `POST /api/whatsapp/demo/messages`: simula texto ou áudio recebido, somente no adapter falso e com conta conectada.
- `GET /api/media/:messageId/access`: cria URL relativa assinada por dois minutos para mídia acessível no workspace autenticado;
- `GET /api/media/:messageId/content`: entrega a mídia somente com sessão ativa, workspace correspondente, prazo e assinatura válidos.

Uma versão desatualizada na mudança de estágio retorna `409 version_conflict`. O cliente deve recarregar a negociação antes de tentar novamente.

A decisão de análise usa `decisionId` UUID criado pelo cliente. `accepted` exige pelo menos `stage` ou `tags`; `ignored` não aceita campos aplicáveis. Uma análise possui uma única decisão imutável. Repetir o mesmo UUID e payload é idempotente; outra decisão para a mesma análise retorna `409 decision_conflict`. Aceites atualizam CRM, auditoria e outbox na mesma transação.

O detalhe nunca recebe `workspaceId` do navegador: o isolamento é derivado exclusivamente da sessão. A edição de contato produz `contact.updated` na outbox contendo somente IDs e nomes dos campos alterados, sem telefone, notas ou conteúdo.

Criação e edição manual de contato, mudança de etapa e decisão sobre análise gravam `audit_events` na mesma transação da ação. A resposta expõe nome do usuário, instante, campos alterados, versões e transição de etapa quando aplicável. Telefone, observações, mensagens, transcrições e valores completos de tags não são copiados para a auditoria.

## Processos do backend

```bash
npm run start -w @noter/backend
npm run start:outbox -w @noter/backend
npm run start:realtime -w @noter/backend
npm run start:transcription -w @noter/backend
npm run start:analysis -w @noter/backend
npm run start:retention -w @noter/backend
```

O processo da outbox publica `message.text.ingested`, `message.audio.ingested`, `message.audio.ready_for_analysis`, `message.persisted` e eventos de atualização do CRM nas filas correspondentes. Os jobs e notificações contêm IDs e metadados de roteamento, nunca o conteúdo integral da conversa.

A simulação exige `clientMessageId` UUID e aceita `messageType` igual a `text` ou `audio`. Texto exige `content`; no áudio, qualquer conteúdo é ignorado e a transcrição é produzida apenas pelo adapter falso. O identificador fornecido pelo navegador compõe a chave idempotente; `workspaceId`, conta, direção, contato fictício e horário são definidos no servidor. Não existe endpoint de envio de mensagem nesta fase.

O protocolo de atualização e seus contratos sanitizados estão documentados em [`docs/realtime/events.md`](../realtime/events.md).
O fluxo de setup e os limites do adapter falso estão em [`docs/integrations/whatsapp.md`](../integrations/whatsapp.md).
O contrato da análise e sua execução local estão em [`docs/integrations/analysis.md`](../integrations/analysis.md).
O armazenamento privado, acesso e retenção estão em [`docs/integrations/media.md`](../integrations/media.md).
