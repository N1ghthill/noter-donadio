# Análise assistiva de mensagens

Esta fatia executa uma análise estruturada de cada mensagem recebida. No
ambiente local, somente o adapter `fake` está disponível: nenhum conteúdo é
enviado a um provedor externo. Ele é exclusivo do profile `demo`; no profile
`baileys`, o worker permanece desligado para não gerar sugestões fictícias
sobre conversas reais.

## Fluxo

1. Texto persistido produz `message.text.ingested`.
2. Áudio transcrito produz `message.audio.ready_for_analysis`.
3. A outbox publica um job com `workspaceId`, `messageId` e `negotiationId` na fila `ai-processing`.
4. O worker busca o texto no PostgreSQL, adquire uma concessão de processamento e chama o adapter configurado.
5. A resposta é validada estritamente e persistida em `ai_analyses`.
6. A conclusão ou falha produz `analysis.changed`, sem resumo, entidades ou demais conteúdo no evento.

O worker é iniciado separadamente:

```bash
npm run start:analysis -w @noter/backend
```

Defina `AI_ADAPTER=fake` no desenvolvimento. Qualquer outro valor deixa a análise desabilitada.

## Contrato e segurança

A versão atual do prompt é `message-extraction-v1`. Cada análise é única por mensagem, tipo e versão do prompt. A entrada contém somente a mensagem corrente — ou a transcrição corrente — e nunca o histórico inteiro da conversa.

A saída aceita apenas resumo, entidades (`product`, `amount`, `deadline`), sentimento, objeções, próximas ações, tags e etapa sugerida, além dos metadados do modelo. Campos extras, valores fora das enumerações e escores inválidos fazem o processamento falhar com um código sanitizado.

As sugestões permanecem separadas do CRM. O worker não altera contato, negociação, etapa ou tags. Depois da conclusão, o usuário pode editar e aplicar a etapa e as tags selecionadas ou ignorar a sugestão. A decisão é explícita, imutável e registrada em `analysis_decisions` com usuário, instante, campos aplicados e versão resultante da negociação.

O aceite, a alteração do CRM e os eventos da outbox pertencem à mesma transação serializável. A versão esperada impede uma tela desatualizada de sobrescrever trabalho manual, e o UUID da decisão torna uma reentrega de rede idempotente. Etapa, tags, valor, produto, previsões e a primeira próxima ação sugerida podem ser editados e selecionados antes do aceite; os dados efetivamente aplicados ficam registrados na decisão e recebem marca de confirmação manual. Objeções e demais próximas ações permanecem informativas.

## Idempotência

Uma tentativa possui identificador e horário de início. Entregas repetidas retornam o resultado concluído sem chamar o adapter novamente; uma concessão abandonada pode ser retomada após cinco minutos. A outbox usa tentativas espaçadas para atravessar esse intervalo sem processar simultaneamente a mesma análise.

Jobs, logs e eventos carregam somente identificadores e estado. Conteúdo e resultados completos permanecem no PostgreSQL e são obtidos pela API autenticada.
