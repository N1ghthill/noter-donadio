# API REST inicial do MVP

Estas rotas existem para integração do frontend durante a fundação. As rotas do CRM já usam sessão revogável de usuário.

## Cabeçalhos

- `x-internal-token`: usado somente pelas rotas sob `/api/internal/`;
- cookie `noter_session`: enviado automaticamente pelo navegador nas rotas do CRM.

Nenhum token, telefone ou conteúdo deve aparecer em logs ou exemplos versionados.

## Rotas

- `POST /api/internal/messages/ingest`: ingestão idempotente de texto ou áudio;
- `GET /api/internal/health/ready`: verifica PostgreSQL e Redis, exige token interno e retorna `503` quando uma dependência está indisponível;
- `GET /api/internal/metrics`: expõe métricas Prometheus agregadas e exige token interno;
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`: ciclo da sessão;
- `GET /api/auth/sessions`: lista as sessões ativas do administrador autenticado;
- `DELETE /api/auth/sessions/:id`: revoga uma sessão após confirmar o mesmo UUID no corpo;
- `GET /api/privacy/workspace-export`: baixa a exportação administrativa versionada do workspace;
- `GET /api/audit-events`: lista até 100 eventos minimizados do workspace; aceita `limit` e `action`;
- `GET /api/dashboard`: retorna indicadores agregados; `periodDays` aceita `30`, `90` ou `365`;
- `GET /api/contacts`: lista e busca contatos do workspace;
- `POST /api/contacts`: cria contato manual;
- `PATCH /api/contacts/:id`: edita nome, telefone, tags e observações do contato;
- `DELETE /api/contacts/:id`: exclui o contato e seus agregados após confirmação explícita do mesmo UUID;
- `GET /api/negotiations`: lista o pipeline com filtros opcionais `stage`, `followUp`, `search` e `limit`;
- `POST /api/negotiations`: cria uma negociação manual para um contato do workspace;
- `GET /api/negotiations/:id`: retorna contato, até 100 mensagens cronológicas, mídia/transcrição, até 20 análises, auditoria e até 50 acompanhamentos concluídos;
- `PATCH /api/negotiations/:id`: edita título, valor, produto, previsão de fechamento, próxima ação e prazo com `expectedVersion`;
- `PATCH /api/negotiations/:id/stage`: mudança manual com `expectedVersion`; etapas finais exigem `closeReason`;
- `POST /api/negotiations/:id/next-action/complete`: arquiva a próxima ação e limpa o acompanhamento atual com controle de versão;
- `POST /api/negotiations/:id/analyses/:analysisId/decision`: aceita uma seleção editável de etapa, tags, valor, produto, previsões e próxima ação ou ignora a sugestão, com UUID idempotente e `expectedVersion`;
- `GET /api/conversations`: lista até 50 conversas, usando a mensagem mais recente de cada negociação;
- `GET /api/whatsapp/connection`: consulta o estado da conta principal;
- `POST /api/whatsapp/setup`: inicia setup e retorna QR efêmero no adapter falso;
- `POST /api/whatsapp/demo/connect`: simula a leitura do QR, disponível somente quando o adapter falso está habilitado;
- `POST /api/whatsapp/demo/messages`: simula texto ou áudio recebido, somente no adapter falso e com conta conectada;
- `GET|POST /api/whatsapp/webhook`: valida inscrição e recebe eventos assinados
  da Meta somente quando o kill switch e os segredos estão configurados;
- `GET /api/meta/negotiation-stages`: expõe a allowlist estável de etapas para
  configuração da integração oficial;
- `GET /api/media/:messageId/access`: cria URL relativa assinada por dois minutos para mídia acessível no workspace autenticado;
- `GET /api/media/:messageId/content`: entrega a mídia somente com sessão ativa, workspace correspondente, prazo e assinatura válidos.

Uma versão desatualizada na edição comercial, mudança de etapa, conclusão de acompanhamento ou decisão assistiva retorna `409 version_conflict`. O cliente deve recarregar a negociação antes de tentar novamente.

A decisão de análise usa `decisionId` UUID criado pelo cliente. `accepted` exige pelo menos um campo aplicável, incluindo `nextAction` e `nextActionDueDate`; `ignored` não aceita campos aplicáveis. Uma análise possui uma única decisão imutável e guarda os valores efetivamente aplicados. Repetir o mesmo UUID e payload é idempotente; outra decisão para a mesma análise retorna `409 decision_conflict`. Aceites atualizam CRM, marcas de confirmação manual, auditoria e outbox na mesma transação serializável.

O detalhe, a criação e a edição nunca recebem `workspaceId` do navegador: o isolamento e o usuário autor são derivados exclusivamente da sessão. Valores monetários trafegam como decimal em string e aceitam no máximo duas casas. A edição aceita `null` para limpar conscientemente um campo e ainda registra sua confirmação manual, impedindo reposição silenciosa pela IA. O detalhe expõe os instantes de confirmação de valor, produto, previsão, próxima ação e seu prazo. Datas sem horário trafegam em `YYYY-MM-DD`. Eventos de atualização contêm somente IDs e nomes dos campos alterados.

Criação e edição manual de contato, criação, edição e mudança de etapa da negociação e decisão sobre análise gravam `audit_events` na mesma transação da ação. A resposta expõe nome do usuário, instante, campos alterados, versões e transição de etapa quando aplicável. Telefone, observações, mensagens, transcrições, valores comerciais e valores completos de tags não são copiados para a auditoria ou para notificações.

O dashboard agrega contagens e somas diretamente no PostgreSQL, sempre pelo `workspaceId` da sessão. Valores monetários retornam como decimal em string. A taxa de ganho considera somente negociações fechadas dentro do período escolhido; sem fechamentos, retorna `null`.

Todas as mutações de navegador sob `/api/` exigem um cabeçalho `Origin` presente em `APP_ORIGINS`. A ingestão em `/api/internal/` continua protegida pelo token interno e não depende de origem de navegador. A exclusão de contato retorna `204` também em reentregas ou IDs não pertencentes ao workspace, evitando enumeração.

A exportação retorna `workspace-export-v1` como anexo JSON, usa `Cache-Control: no-store` e aceita no máximo uma geração por minuto por origem no processo atual. Ela inclui dados funcionais e conteúdo do workspace, mas exclui hashes de senha e sessão, credenciais do WhatsApp, chaves físicas de mídia, leases, outbox e tarefas internas. Cada geração cria `workspace_exported` na auditoria. Como o arquivo contém dados pessoais e comerciais, o cliente deve armazená-lo com proteção equivalente à do banco.

A auditoria global exige administrador e retorna por padrão os 50 eventos mais recentes, sempre filtrados pelo workspace da sessão. `limit` aceita de 1 a 100 e `action` aceita somente ações conhecidas. A resposta usa uma allowlist para `details` e não inclui conteúdo de mensagem, transcrição, telefone, observações, valores comerciais ou tags completas.

## Processos do backend

```bash
npm run start -w @noter/backend
npm run start:outbox -w @noter/backend
npm run start:realtime -w @noter/backend
npm run start:media-download -w @noter/backend
npm run start:transcription -w @noter/backend
npm run start:analysis -w @noter/backend
npm run start:retention -w @noter/backend
```

O processo da outbox publica `message.text.ingested`,
`message.audio.download_requested`, `message.audio.ingested`,
`message.audio.ready_for_analysis`, `message.persisted` e eventos de atualização
do CRM nas filas correspondentes. Os jobs e notificações contêm IDs e metadados
de roteamento, nunca o conteúdo integral da conversa. O processo
`media-download` é obrigatório para áudio externo e permanece opt-in no perfil
real.

`GET /health` é somente um liveness público e não consulta nem revela dependências. Readiness e métricas são privados, desabilitam cache e não expõem URLs, credenciais, mensagens de erro ou labels com identificadores de negócio. O proxy de produção devolve `404` para `/api/internal/`; processos autorizados devem acessar essas rotas diretamente pela rede interna do backend.

O CI executa lint, migrations em banco vazio, testes com PostgreSQL e Redis, typecheck e build. O teste integrado usa workspace e prefixo BullMQ exclusivos e percorre ingestão HTTP, outbox, análise e notificação em tempo real sem compartilhar conteúdo com serviços externos.

A simulação exige `clientMessageId` UUID e aceita `messageType` igual a `text` ou `audio`. Texto exige `content`; no áudio, qualquer conteúdo é ignorado e a transcrição é produzida apenas pelo adapter falso. O identificador fornecido pelo navegador compõe a chave idempotente; `workspaceId`, conta, direção, contato fictício e horário são definidos no servidor. Não existe endpoint de envio de mensagem nesta fase.

O protocolo de atualização e seus contratos sanitizados estão documentados em [`docs/realtime/events.md`](../realtime/events.md).
O fluxo de setup e os limites do adapter falso estão em [`docs/integrations/whatsapp.md`](../integrations/whatsapp.md).
O contrato da análise e sua execução local estão em [`docs/integrations/analysis.md`](../integrations/analysis.md).
O armazenamento privado, acesso e retenção estão em [`docs/integrations/media.md`](../integrations/media.md).
O contrato de exclusão e suas cascatas estão em [`docs/security/privacy-deletion.md`](../security/privacy-deletion.md).
