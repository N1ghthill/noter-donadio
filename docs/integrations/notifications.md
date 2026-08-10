# Notificações do andamento do atendimento

O sistema pode avisar um dispositivo pelo Bark conforme uma mensagem recebida
avança pelo pipeline. A integração é opcional e permanece desabilitada por
padrão. Ela não envia respostas ao WhatsApp nem aplica sugestões da IA.

## Dados enviados

O webhook recebe somente conteúdo estático, escolhido entre estes marcos:

- `Atendimento recebido`, após persistência e somente se a análise ainda não
  tiver produzido um aviso mais útil dentro de um minuto;
- `Novo lead pronto para revisão`, quando a análise concluída classifica a
  interação como `new_lead`;
- `Conversa analisada`, para os demais contextos analisados;
- `Análise precisa de atenção` ou `Áudio precisa de atenção`, quando a etapa
  continua falha depois da janela normal de retries;
- grupos `Construção Financiada 360 · Atendimentos` e
  `Construção Financiada 360 · Sistema`;
- links para as conversas do dia ou para a Administração.

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
BARK_NOTIFICATION_OPEN_URL=https://leadcontrol.online/conversas?period=today
BARK_OPERATIONAL_WEBHOOK_URL=
BARK_OPERATIONAL_OPEN_URL=https://leadcontrol.online/administracao
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

`BARK_OPERATIONAL_WEBHOOK_URL` é opcional. Quando configurado, alertas de falha
vão para o dispositivo do responsável técnico; quando vazio, permanecem no
destino principal para não tornar falhas invisíveis. A confirmação de recebimento
é passiva, um novo lead é sensível ao tempo e os demais avisos são ativos. Alertas
críticos não são usados.

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
