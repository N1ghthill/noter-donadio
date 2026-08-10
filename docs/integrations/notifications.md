# Notificações do andamento do atendimento

O sistema pode avisar um dispositivo pelo Bark conforme uma mensagem recebida
avança pelo pipeline. A integração é opcional e permanece desabilitada por
padrão. Ela não envia respostas ao WhatsApp nem aplica sugestões da IA.

## Dados enviados

O webhook recebe somente conteúdo estático, escolhido entre estes marcos:

- `Nova mensagem no WhatsApp`, após persistência;
- `Novo lead identificado pela IA`, quando a análise concluída classifica a
  interação como `new_lead`;
- `Análise da IA concluída`, para os demais contextos analisados;
- `Análise precisa de atenção` ou `Áudio precisa de atenção`, quando a etapa
  continua falha depois da janela normal de retries;
- grupo `Construção Financiada 360`;
- link para `https://leadcontrol.online/conversas`.

Nome, telefone, JID, texto, transcrição, mídia e IDs internos não são enviados ao
Bark. O job contém apenas `workspaceId`, `messageId` e o marco enumerado, usados
internamente para confirmar direção, data, estado atual e idempotência no
PostgreSQL. A classificação `new_lead` altera somente a cópia estática do aviso;
nenhuma saída textual do modelo atravessa o webhook.

## Configuração

Use como `BARK_WEBHOOK_URL` apenas a URL-base do dispositivo:

```dotenv
NOTIFICATION_ADAPTER=bark
BARK_WEBHOOK_URL=https://api.day.app/CHAVE_DO_DISPOSITIVO
BARK_NOTIFICATION_OPEN_URL=https://leadcontrol.online/conversas
BARK_TIMEOUT_MS=10000
NOTIFICATION_NOT_BEFORE=2026-08-10T15:00:00Z
COMPOSE_PROFILES=baileys,notifications
```

Não inclua título ou corpo na URL. O segredo deve existir somente no `.env` do
servidor, com permissão restrita, e nunca ser versionado. Defina
`NOTIFICATION_NOT_BEFORE` imediatamente antes da ativação; mensagens anteriores
ao corte, mensagens enviadas pelo operador e eventos desconhecidos são ignorados.
Falhas de análise e transcrição aguardam dez minutos antes da conferência. Se o
retry já concluiu a etapa, o aviso de atenção é cancelado; se a etapa ainda está
pendente, o job continua tentando sem gerar uma nova entrega concorrente.

Depois de configurar, a publicação exige o procedimento operacional normal de
deploy. Os testes automatizados usam um `fetch` falso e nunca chamam o serviço
real.

## Entrega e falhas

Uma tabela de entregas mantém estado, tentativa e lease por mensagem, canal e
marco. Isso
impede duplicação em retries concorrentes e permite recuperação após falha. Como
o Bark não oferece uma chave idempotente transacional com o PostgreSQL, uma
interrupção entre a confirmação HTTP e a gravação local ainda pode produzir um
aviso duplicado. O payload genérico reduz o impacto e nenhuma mensagem do cliente
é exposta em logs ou erros.

As métricas `noter_notifications`,
`noter_oldest_pending_age_seconds{pipeline="notification"}` e a fila
`inbound-notifications` permitem acompanhar backlog e falhas sem expor dados de
negócio.
