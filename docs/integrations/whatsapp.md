# Integração com WhatsApp

## Estado desta fatia

O projeto possui o fluxo completo de interface e domínio para configurar uma conta, mas usa exclusivamente um adapter falso local. Nenhuma biblioteca não oficial, conta real ou serviço da Meta é acessado.

Ative o simulador explicitamente:

```dotenv
WHATSAPP_ADAPTER=fake
```

Com `disabled`, que é o padrão quando a variável está ausente, as rotas de setup não são registradas.

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

## Porta para integração futura

`WhatsappGateway` define criação e consulta do QR e conclusão da conexão. Um adapter real deverá implementar essa porta sem contaminar domínio, HTTP ou frontend com APIs do provedor.

Antes de habilitar um adapter real ainda será necessário:

- criptografia autenticada das credenciais em repouso;
- processo dedicado para manter a sessão;
- tratamento de reconexão, logout e rotação de chaves;
- revisão dos termos do provedor e do risco operacional;
- testes com uma conta controlada, nunca com a conta principal do cliente.
