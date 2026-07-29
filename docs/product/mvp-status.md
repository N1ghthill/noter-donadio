# Estado verificável do MVP

Última auditoria: 29/07/2026.

Esta matriz compara o escopo executável com código, testes e runtime da VPS.
`Pronto` significa implementado e validado. `Preparado` significa que o código
está pronto, mas a integração externa permanece deliberadamente desligada.

| Capacidade | Estado | Evidência principal |
| --- | --- | --- |
| Login administrativo e sessões revogáveis | Pronto | Rotas autenticadas, cookie opaco, tela de administração e testes |
| QR, sessão e reconexão Baileys | Pronto no código; novo pareamento pendente | Auth state PostgreSQL cifrado, processo dedicado, reconexão transitória observada e encerramento terminal tratado |
| Substituição controlada do número | Pronto no código; não executada | Confirmação da conta, recusa de sessão ativa, limpeza atômica somente do auth state e auditoria |
| Ingestão direta de texto recebido e enviado | Pronto | Normalização `notify`/`fromMe`, deduplicação e persistência transacional |
| Ingestão e download privado de áudio | Pronto | Referência mínima cifrada, worker pós-commit e `5/5` downloads concluídos na VPS |
| Contatos manuais e automáticos | Pronto | Cadastro, edição, exclusão controlada e criação pela ingestão |
| Pipeline, Kanban e dados comerciais | Pronto | Filtros, drag/select de etapa, concorrência otimista e fechamento com motivo |
| Próxima ação e histórico de conclusão | Pronto | Edição, filtros de prazo, conclusão auditável e histórico imutável |
| Dashboard comercial | Pronto | Agregações PostgreSQL, acompanhamentos e conversão em 30/90/365 dias |
| Home e central de controle | Pronto no código | Prioridades diárias, atalhos e painel agregado em rotas separadas |
| Conversas, filtros, classificação e histórico | Pronto no código | Tabela clicável, início real, contagem, última análise concluída e detalhe cronológico |
| Agenda de próximas ações | Pronto no código | Filtros de prazo, resumo, classificação e conclusão auditável |
| Arquivos por contato | Pronto no código | Catálogo de áudio sem chave física e reprodução por URL curta e assinada |
| Atualização em tempo real | Pronto | Eventos sanitizados por workspace e reconciliação REST |
| Sugestões sem ação autônoma | Pronto no modo sintético | Saída estrita, edição, aceite/recusa explícitos e auditoria |
| Transcrição OpenAI | Preparado | Adapter, limites, timeout, retries e corte obrigatório; chave não configurada |
| Análise OpenAI | Preparado | Responses API, Structured Outputs, `store: false` e corte obrigatório |
| Retenção, exclusão de contato e exportação | Pronto para a fase | Worker de retenção, remoção de agregado e exportação administrativa |
| Health checks e observabilidade local | Pronto | Readiness privado, métricas, Prometheus, Grafana e Alertmanager saudáveis |

## Estado publicado

`https://leadcontrol.online` opera com PostgreSQL, Redis, aplicação, Caddy,
processo Baileys, download de mídia, outbox, tempo real, retenção e
observabilidade na mesma VPS. A aplicação e as dependências foram verificadas
saudáveis. A sessão Baileys recuperou desconexões transitórias de código `428`,
mas, após a publicação desta auditoria, o servidor do WhatsApp encerrou a
sessão com código terminal `401`. O processo marcou a conta como desconectada e
não tentou um loop de reconexão; é necessário novo pareamento por QR autorizado
pelo responsável.

O responsável adiou esse pareamento até adquirir outro número. A aplicação não
tentará conectar nem gerar QR por conta própria. Quando o número estiver
disponível, a tela permitirá preparar a troca com confirmação explícita,
preservando todo o histórico do CRM, e só então iniciar um novo QR.

O ambiente publicado não oferece simulação de mensagens. Ele preserva análises
sintéticas históricas claramente identificadas, mas novas transcrições e
análises permanecem desligadas enquanto a chave OpenAI não for configurada.
Existe um áudio real autorizado com download concluído aguardando essa decisão.

## Pendências que não impedem continuar o produto

- homologar transcrição e análise reais quando houver chave e autorização;
- aceitar formalmente o risco operacional e os termos aplicáveis ao Baileys;
- escolher um destino externo para alertas, com política e responsável;
- implementar backup criptografado fora da VPS quando a fase exigir recuperação
  contra perda integral do host;
- executar avaliação formal de segurança e privacidade antes de ampliar o uso
  para dados de clientes;
- definir política e protocolo de exclusão integral de workspace, que permanece
  fora do MVP.

## Regra para continuidade

Novas funcionalidades comerciais podem continuar sem OpenAI. Mudanças não
devem usar análises falsas no profile Baileys nem apresentar recursos
desligados como processamento pendente. A ativação assistiva continuará
exigindo chave interativa, profile `assistive` e corte temporal.
