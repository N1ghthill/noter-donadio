# Integração com WhatsApp

## Estado desta fatia

Há dois caminhos isolados:

- o adapter falso implementa QR, conexão e caixa de entrada exclusivamente para
  demonstração;
- a WhatsApp Cloud API oficial da Meta possui webhook de entrada e adapter de
  download compilados, mas desligados por padrão e sem credenciais versionadas.

A VPS usa somente o primeiro caminho. Nenhuma conta real ou chamada à Meta faz
parte da homologação atual.

Ative o simulador explicitamente:

```dotenv
WHATSAPP_ADAPTER=fake
```

Com `disabled`, que é o padrão quando a variável está ausente, as rotas de setup não são registradas.

## Fronteira oficial da Meta

`GET|POST /api/whatsapp/webhook` é registrado somente com
`META_WEBHOOK_ENABLED=1`, `META_WEBHOOK_VERIFY_TOKEN` e `META_APP_SECRET`
válidos. O POST valida a assinatura sobre os bytes originais antes do parse,
limita o corpo, resolve WABA e número empresarial para uma conta conectada e
normaliza somente texto e áudio recebidos. Status e tipos fora do MVP não criam
mensagens.

Os dois segredos são entregues somente ao processo `backend`; migrations,
outbox, realtime, retenção e demais workers recebem o kill switch desligado e
não recebem essas credenciais.

Texto já percorre a transação idempotente e a outbox existentes. Áudio possui
persistência atômica da referência, fila própria e adapter autenticado de
download, mas permanece recusado pelo webhook até uma ativação operacional
explícita com `META_WEBHOOK_AUDIO_ENABLED=1`. O worker real deve ser ativado no
mesmo deploy e exige `MEDIA_DOWNLOAD_ADAPTER=meta`, `META_ACCESS_TOKEN` e uma
versão fixa da Graph API. O token de acesso é entregue somente a esse worker.

Não existe endpoint de envio. A integração inicial é somente de entrada e,
portanto, ainda não atende ao requisito completo de capturar mensagens que o
usuário enviou por uma origem real.

## Jornada local

1. O usuário autenticado abre `/whatsapp`.
2. `POST /api/whatsapp/setup` gera um payload aleatório com validade de cinco minutos.
3. O QR é devolvido com `Cache-Control: no-store` e permanece somente na memória da API.
4. O banco persiste `qr_generated`, mas nunca o conteúdo do QR.
5. “Simular leitura do QR” consome o código e persiste `connected` com número fictício.
6. A outbox publica apenas conta, workspace e estado.
7. O frontend recebe a invalidação via Socket.IO e reconcilia pela API.

## Caixa de entrada simulada

Com a conta falsa conectada, `/conversas` permite registrar texto ou áudio fictício recebido. O navegador cria um `clientMessageId` UUID; o servidor deriva workspace e conta da sessão, acrescenta uma identidade fictícia fixa e executa o mesmo serviço de ingestão usado pelos eventos internos. No áudio, texto fornecido pelo navegador é descartado e nunca tratado como transcrição.

A transação resolve contato e negociação, persiste a mensagem antes de qualquer processamento e cria dois eventos de outbox: um para processamento e `message.persisted` para reconciliação da interface. Repetir o mesmo UUID não duplica a mensagem. O formulário não envia dados a uma conta ou provedor externo.

## Segurança

- workspace sempre deriva da sessão, nunca do corpo da requisição;
- QR não é escrito em banco, Redis, outbox ou logs;
- respostas com QR não podem ser armazenadas em cache;
- payloads de tempo real descartam qualquer campo adicional;
- somente dados fictícios são usados nos testes;
- não existe endpoint para enviar mensagens; a única mutação de conversa simula uma entrada local;
- o adapter falso não deve ser habilitado em produção.

## Porta de domínio

`WhatsappGateway` define criação e consulta do QR e conclusão da conexão do
simulador. O adapter oficial mantém payloads e autenticação da Meta em sua
própria fronteira e entrega ao domínio somente o contrato normalizado.

Antes de habilitar a integração real ainda será necessário:

- criptografia autenticada das credenciais em repouso;
- provisionamento controlado da conta, rotação e revogação de credenciais;
- decisão oficial para capturar mensagens enviadas pelo usuário;
- revisão dos termos do provedor e do risco operacional;
- testes com uma conta controlada, nunca com a conta principal do cliente.
