# noter.donadio

Pipeline inteligente de contatos e negociações alimentado por conversas do WhatsApp e análise assistiva por IA.

O projeto possui um MVP local funcional com PostgreSQL, Redis, filas, atualização em tempo real e adapters falsos para integrações externas. Antes de alterar código, leia [AGENTS.md](AGENTS.md), o [escopo do MVP](docs/product/mvp.md) e as [decisões arquiteturais](docs/architecture/decisions.md).

## Requisitos

- Node.js 24 LTS;
- npm 11 ou superior.

```bash
npm install
npm run prisma:validate -w @noter/backend
npm run lint
npm run typecheck
npm test
npm run build
```

Para iniciar PostgreSQL e Redis localmente:

```bash
docker compose -f compose.dev.yaml up -d
npm exec -w @noter/backend -- prisma migrate dev
```

## Documentação de origem

- `projeto_tecnico_noter_donadio_FINAL_PDF.md`: relatório técnico original;
- `projeto_tecnico_noter_donadio_FINAL_PDF.pdf`: versão renderizada;
- `diagramas/`: fluxos e modelo visual original.

O relatório permanece como referência histórica. As correções necessárias para implementação são registradas em `docs/architecture/decisions.md`.

## Estrutura do projeto

```text
backend/                 API, ingestão do WhatsApp e workers
frontend/                aplicação web/PWA
packages/contracts/      contratos compartilhados sem dependências de infraestrutura
docs/                    produto, arquitetura e operação
```

O MVP usa Node.js 24 LTS, TypeScript 6, Fastify 5, React 19 e Vite 8. API, persistência, outbox, autenticação, workers e interface são implementados em fatias verticais testáveis; adapters externos de WhatsApp, transcrição e IA permanecem isolados das regras de domínio.

A API disponível nesta fase está documentada em [`docs/api/mvp-rest.md`](docs/api/mvp-rest.md).
O modelo de login, cookies, sessões e bootstrap está em [`docs/security/authentication.md`](docs/security/authentication.md).
O fluxo de exclusão, cascatas, auditoria minimizada e limpeza de mídia está em [`docs/security/privacy-deletion.md`](docs/security/privacy-deletion.md).
O fluxo da interface e sua execução local estão em [`docs/frontend/mvp-ui.md`](docs/frontend/mvp-ui.md).
O fluxo Socket.IO, isolamento por workspace e contratos de eventos estão em [`docs/realtime/events.md`](docs/realtime/events.md).
O setup simulado e a fronteira do adapter de WhatsApp estão em [`docs/integrations/whatsapp.md`](docs/integrations/whatsapp.md).
O worker idempotente e o adapter falso de áudio estão em [`docs/integrations/transcription.md`](docs/integrations/transcription.md).
O armazenamento privado local, acesso assinado, player e retenção estão em [`docs/integrations/media.md`](docs/integrations/media.md).
O worker de análise assistiva, seu contrato estrito e seus limites estão em [`docs/integrations/analysis.md`](docs/integrations/analysis.md).
O empacotamento em containers, secrets, migrations, backup e limites de produção estão em [`docs/operations/production.md`](docs/operations/production.md).

A aceitação do marco `v0.2.0-mvp` está registrada em [`docs/operations/acceptance.md`](docs/operations/acceptance.md). Os portões para WhatsApp oficial, transcrição e análise reais estão em [`docs/operations/provider-readiness.md`](docs/operations/provider-readiness.md).

Com o ambiente local iniciado, `/pipeline` permite filtrar e acompanhar negociações, concluir próximas ações e registrar fechamentos; `/` exibe indicadores agregados e `/administracao` permite revogar sessões, consultar a auditoria global e exportar os dados do workspace. `/conversas` apresenta a caixa de entrada persistida e permite simular uma mensagem recebida sem conectar ou enviar dados a um WhatsApp real.
