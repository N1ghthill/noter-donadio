# Estado verificável do MVP

Última auditoria: 03/08/2026.

Esta matriz compara o escopo executável com código, testes e runtime da VPS.
`Pronto` significa implementado e validado. `Preparado` significa que o código
está pronto, mas a integração externa permanece deliberadamente desligada.

| Capacidade | Estado | Evidência principal |
| --- | --- | --- |
| Login administrativo e sessões revogáveis | Pronto | Rotas autenticadas, cookie opaco, tela de administração e testes |
| QR, sessão e reconexão Baileys | Pronto e homologado | Auth state PostgreSQL cifrado, processo dedicado, QR real, reconexão e nova rodada controlada de texto e mídia |
| Substituição controlada do número | Pronto no código; não executada | Confirmação da conta, recusa de sessão ativa, limpeza atômica somente do auth state e auditoria |
| Ingestão direta de texto recebido e enviado | Pronto | Normalização `notify`/`fromMe`, deduplicação e persistência transacional |
| Ingestão e download privado de mídia | Pronto | Áudio, imagem e documento preservados, referência mínima cifrada, worker pós-commit, recuperação de URL expirada e acesso privado renovável |
| Contatos manuais e automáticos | Pronto | Cadastro, edição, prevenção de duplicação manual, consolidação confirmada e auditada e criação pela ingestão |
| Pipeline, Kanban e dados comerciais | Pronto | Filtros, drag/select de etapa, concorrência otimista e fechamento com motivo |
| Próxima ação e histórico de conclusão | Pronto | Edição, filtros de prazo, conclusão auditável e histórico imutável |
| Dashboard comercial | Pronto | Agregações PostgreSQL, acompanhamentos, entrada, valor ganho, ticket médio e conversão em 30/90/365 dias |
| Home e central de controle | Pronto | Prioridades diárias, central de pendências e indicadores clicáveis com filtros contextuais em rotas separadas |
| Piloto guiado | Pronto | Seis jornadas navegáveis, progresso local sem mutação comercial e roteiro operacional |
| Conversas, filtros, classificação e histórico | Pronto | Tabela clicável, paginação, detalhe cronológico por pessoa, mídias, follow-up rápido e navegação contextual |
| Agenda de próximas ações | Pronto | Filtros, resumo, classificação, edição rápida e conclusão auditável |
| Arquivos por contato | Pronto | Mídias privadas, filtros persistidos, grade/lista responsivas, transcrição de áudio, retenção visível, renovação de acesso e navegação contextual |
| Atualização em tempo real | Pronto | Eventos sanitizados por workspace e reconciliação REST |
| Sugestões sem ação autônoma | Pronto; integração real em diagnóstico controlado | Saída estrita, edição, aceite/recusa explícitos, falhas sanitizadas, retry manual e auditoria |
| Transcrição OpenAI | Disponível; não selecionada | Adapter preservado, `gpt-4o-mini-transcribe`, corte temporal, diagnóstico sanitizado e retry administrativo explícito |
| Análise OpenAI | Disponível; não selecionada | Responses API, Structured Outputs, `store: false`, corte temporal, diagnóstico sanitizado e retry administrativo explícito |
| Groq alternativo | Ativo; áudio real pendente de homologação | Seleção explícita, análise sintética validada com GPT-OSS 20B, Whisper Large V3 Turbo, corte próprio e sem fallback silencioso |
| Retenção, exclusão de contato e exportação | Pronto para a fase | Worker de retenção, remoção de agregado e exportação administrativa |
| Health checks e observabilidade local | Pronto | Readiness privado, métricas, Prometheus, Grafana e Alertmanager saudáveis |

## Estado publicado

`https://leadcontrol.online` opera com PostgreSQL, Redis, aplicação, Caddy,
processo Baileys, download de mídia, outbox, tempo real, retenção e
observabilidade na mesma VPS. A aplicação e as dependências foram verificadas
saudáveis em 03/08/2026. O cliente pareou por QR o número permanente e a sessão
Baileys permanece conectada. Texto e mídias continuam sendo preservados e os
downloads privados observados estão concluídos. O sistema não conecta, troca,
desconecta nem envia mensagens por conta própria.

O ambiente publicado não oferece simulação de mensagens. Ele preserva análises
sintéticas históricas claramente identificadas. Em 30/07/2026, a chave OpenAI
foi injetada externamente e os workers assistivos foram ativados com corte
temporal. Em 03/08/2026, o Groq foi selecionado explicitamente para análise e
transcrição, com novo corte temporal. A análise estruturada foi homologada com
dados sintéticos; a transcrição aguarda um novo áudio real posterior ao corte.
As falhas antigas permanecem registradas, sem jobs pendentes ou em processamento,
e não serão repetidas automaticamente. A administração oferece retry somente
após confirmação explícita. As mídias originais permanecem consultáveis mesmo
se o provedor falhar.

## Pendências que não impedem continuar o produto

- usar a administração para repetir uma análise controlada, corrigir a causa
  sanitizada observada e homologar uma nova mensagem e um novo áudio;
- aceitar formalmente o risco operacional e os termos aplicáveis ao Baileys;
- escolher e configurar um destino externo para alertas, com política e responsável;
- implementar backup criptografado fora da VPS quando a fase exigir recuperação
  contra perda integral do host;
- executar avaliação formal de segurança e privacidade antes de ampliar o uso
  para dados de clientes;
- definir política e protocolo de exclusão integral de workspace, que permanece
  fora do MVP.

## Regra para continuidade

Novas funcionalidades comerciais podem continuar sem conexão do WhatsApp.
Mudanças não devem usar análises falsas no profile Baileys nem reprocessar o
backlog anterior ao corte. A ativação assistiva exige chave interativa, acesso
prévio aos dois modelos, profile `assistive` e corte temporal.

O piloto controlado deve seguir
[`docs/operations/pilot.md`](../operations/pilot.md). Concluir o checklist no
navegador auxilia a reunião, mas o aceite formal depende do registro de
resultado, severidade e responsável descrito nesse roteiro.
