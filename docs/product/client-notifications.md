# Guia do cliente — avisos de atendimento

O aplicativo acompanha as conversas recebidas pelo WhatsApp e envia avisos ao
responsável pelo atendimento. Os avisos confirmam o trabalho do sistema, mas não
respondem ao contato e não aplicam decisões comerciais automaticamente.

## O que acontece depois de uma mensagem

1. O WhatsApp conectado recebe a mensagem.
2. O CRM salva a conversa antes de qualquer processamento externo.
3. A IA analisa o contexto e prepara sugestões para revisão.
4. O Bark avisa o responsável e abre as conversas recentes no CRM.
5. Uma pessoa revisa as informações e decide como responder.

Quando a análise termina em até um minuto, o aviso de resultado substitui a
confirmação genérica de recebimento. Se a análise demorar, o cliente recebe
primeiro `Atendimento recebido`, para saber que a conversa está preservada.

## Significado dos avisos

| Aviso | Significado | Ação esperada |
| --- | --- | --- |
| `Atendimento recebido` | A conversa foi salva e continua em análise | Nenhuma ação imediata é obrigatória |
| `Novo lead pronto para revisão` | A IA reconheceu uma possível oportunidade nova | Abrir, revisar e responder |
| `Conversa analisada` | O contexto e as sugestões estão disponíveis | Conferir antes de aplicar ou responder |
| `Análise precisa de atenção` | A IA não concluiu após as tentativas automáticas | Revisar na Administração |
| `Áudio precisa de atenção` | A transcrição não concluiu após as tentativas automáticas | Revisar na Administração |

Os avisos nunca incluem nome, telefone, texto, áudio, transcrição ou conteúdo
gerado pela IA. A tela `Administração` mostra o estado do WhatsApp, a última
mensagem recebida, a última notificação entregue e contagens agregadas.

## Limite de automação

O produto é assistivo. A IA organiza, classifica e sugere, mas somente uma pessoa
autenticada pode responder no WhatsApp ou aceitar alterações comerciais. O texto
`Respostas automáticas desativadas` permanece visível na Administração para tornar
esse limite verificável.
