# Decisões arquiteturais do MVP

Status: aprovado como base inicial de implementação em 20/07/2026.

Este documento resolve ambiguidades encontradas no relatório técnico original. Mudanças futuras devem acrescentar uma decisão datada e explicar impacto e migração.

## ADR-001 — Monólito modular com processos independentes

O MVP terá um único backend TypeScript organizado por módulos, executado em processos separados para API, conexão do WhatsApp e workers. Isso reduz duplicação e custo operacional sem misturar responsabilidades em runtime.

Não haverá microsserviços distribuídos no MVP. Limites de módulo e adapters devem permitir extração futura se houver necessidade comprovada.

## ADR-002 — Workspace explícito desde o início

Embora o primeiro deployment atenda um único cliente, todas as entidades de negócio terão `workspaceId`. A unicidade de identificadores externos será composta pelo workspace ou pela conta do WhatsApp.

Isso substitui referências inconsistentes a `client_id` no fluxo original e evita uma migração estrutural para isolamento futuro.

## ADR-003 — Etapa da negociação separada de atividade

O campo do Kanban será `stage`. Negociações ativas são obtidas por exclusão das etapas finais, e não por `status = 'active'`.

Etapas iniciais:

1. `lead`
2. `qualified`
3. `proposal_sent`
4. `in_negotiation`
5. `on_hold`
6. `closed_won`
7. `closed_lost`

A IA registra uma sugestão de etapa. Apenas uma ação explícita do usuário muda a etapa no MVP.

## ADR-004 — Persistência antes do processamento

Contato, negociação, mensagem e evento de publicação são persistidos atomicamente antes de chamar IA ou transcrição. Um dispatcher publica eventos pendentes no BullMQ e pode repeti-los com segurança.

Workers recebem IDs e releem o estado no PostgreSQL. Uma restrição única e registros de execução impedem efeitos duplicados.

Essa decisão substitui os diagramas que inserem a mensagem somente após a resposta do modelo.

## ADR-005 — Transcrição pertence à mensagem de áudio

Não será criada uma segunda mensagem virtual para a transcrição. A mensagem original mantém o tipo `audio`; um artefato associado armazena mídia, estado de transcrição, texto e erro sanitizado.

O worker de IA pode consumir a transcrição como representação textual da mesma mensagem. Assim, timeline, contagem e idempotência não ficam duplicadas.

## ADR-006 — Contato manual pode não possuir JID

`jid` será anulável. Um contato manual pode nascer com nome e telefone normalizado e ser vinculado posteriormente a uma identidade observada no WhatsApp.

A vinculação automática só é permitida quando a identidade for inequívoca. Casos ambíguos geram sugestão de mesclagem para confirmação humana.

## ADR-007 — QR code é exibido, não lido pelo frontend

O backend recebe o QR de autenticação da sessão e o disponibiliza temporariamente ao frontend autenticado. O usuário abre o WhatsApp no telefone e escaneia o QR exibido.

Não será adicionada biblioteca de leitura de QR pela câmera para esse fluxo.

## ADR-008 — Baileys é uma integração não oficial

Baileys não é uma API oficial da Meta. A integração ficará isolada atrás de uma porta de domínio, com reconexão, health state e possibilidade de troca por outro provedor.

Antes de produção, devem ser validados termos de uso, risco de bloqueio da conta, requisitos de consentimento e alternativa oficial. Nenhum teste automatizado utiliza conta real.

## ADR-009 — Estado de autenticação criptografado no PostgreSQL

O MVP usará um adapter de autenticação próprio para persistir credenciais e chaves da sessão no PostgreSQL. Cada payload sensível será criptografado pela aplicação com AES-256-GCM e chave externa ao banco.

`useMultiFileAuthState` pode ser usado apenas em protótipo local descartável e nunca como armazenamento de produção.

## ADR-010 — REST reconciliável e tempo real descartável

Socket.IO informa que algo mudou, mas não é a fonte de verdade. Cada evento inclui IDs e versão suficiente para o frontend invalidar ou atualizar consultas. Após desconexão, o frontend reconcilia o estado pela API REST.

## ADR-011 — Valores manuais têm precedência

Campos atualizáveis por IA guardam origem e instante da última confirmação. Uma extração do modelo não sobrescreve um valor marcado como confirmado pelo usuário. Divergências aparecem como sugestões pendentes.

## ADR-012 — Privacidade entra no desenho do MVP

O produto deve possuir política configurável de retenção de mídia, exclusão por contato/workspace, trilha de auditoria e minimização do contexto enviado à IA. Logs de produção não armazenam conteúdo de conversas.

## ADR-013 — Sessões opacas em cookie, sem JWT no navegador

O frontend autentica por cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção. O valor da sessão possui 256 bits aleatórios; apenas seu SHA-256 é persistido. Sessões expiram em oito horas, podem ser revogadas no servidor e nunca são guardadas em `localStorage` ou `sessionStorage`.

Senhas usam `scrypt` com salt individual e parâmetros versionados. O token interno continua existindo somente para ingestão entre processos e não autoriza rotas do CRM.

## ADR-014 — Migrations são validadas em PostgreSQL vazio no CI

Toda alteração de schema deve incluir uma migration versionada e aplicável em um banco PostgreSQL vazio. O CI inicia PostgreSQL 16 e executa `prisma migrate deploy` antes de typecheck, testes e build.

A migration inicial publicada em 20 de julho de 2026 continha acidentalmente uma linha de saída do CLI antes do SQL. Ela foi corrigida no dia seguinte, antes de qualquer aplicação bem-sucedida ou uso compartilhado do banco. Essa é a única exceção à regra de não editar migrations publicadas; migrations futuras devem receber correções incrementais.

## ADR-015 — Jornada do WhatsApp começa com adapter falso explícito

Setup, QR e estados de conexão são desenvolvidos contra a porta `WhatsappGateway`. O primeiro adapter é um simulador em memória habilitado somente por `WHATSAPP_ADAPTER=fake`; ausência da configuração mantém as rotas desabilitadas.

O QR é efêmero e nunca é persistido ou propagado por eventos. Essa etapa valida domínio, autenticação, frontend e tempo real antes de introduzir uma biblioteca não oficial ou uma conta real.

## ADR-016 — Caixa de conversas é uma projeção das mensagens persistidas

No MVP, uma conversa corresponde ao histórico de uma negociação e não recebe tabela ou estado independente. A caixa de entrada consulta a mensagem mais recente de cada negociação diretamente no PostgreSQL, com limite explícito, e abre o histórico já oferecido pelo detalhe da negociação.

Uma nova mensagem produz `message.persisted` na mesma transação da mensagem e do evento de processamento. A notificação contém somente IDs e invalida as consultas React; conteúdo e telefone continuam disponíveis apenas nas rotas REST autenticadas. A simulação local percorre o serviço de ingestão normal e usa um UUID do cliente na chave de idempotência.

## ADR-017 — Transcrição usa lease persistido por tentativa

O worker de áudio adquire no PostgreSQL um lease identificado por UUID e instante de início. Somente a tentativa atual pode gravar sucesso ou falha; entregas repetidas de uma mídia concluída não chamam o adapter, e leases abandonados podem ser retomados depois de cinco minutos.

O job contém apenas IDs. O resultado do adapter é validado e permanece no `MediaAsset` da mensagem original. Sucesso ou falha cria `message.transcription.changed` com IDs e estado, nunca com o texto transcrito. O adapter falso valida esse contrato sem obter mídia ou acessar um provedor externo.

## ADR-018 — Análise é versionada, estrita e apenas sugestiva

Cada mensagem recebe no máximo uma análise por tipo e versão do prompt. O worker usa somente o texto da mensagem corrente ou sua transcrição concluída, adquire um lease persistido por tentativa e valida a resposta contra uma lista fechada de campos, enumerações e limites antes de gravá-la.

Jobs e eventos carregam apenas IDs e estado. Resultados permanecem no PostgreSQL e são reconciliados pela API autenticada. O worker de análise não altera contato, tags, valor ou etapa da negociação: toda aplicação de uma sugestão depende de confirmação explícita e auditável do usuário.

## ADR-019 — Decisões de IA são explícitas, imutáveis e idempotentes

O usuário pode aceitar uma seleção editável de etapa, tags, valor, produto, previsões e próxima ação ou ignorar uma análise concluída. Cada análise possui no máximo uma decisão, vinculada ao usuário autenticado. Um UUID fornecido pelo cliente permite reentrega idempotente; decisões diferentes para a mesma análise são recusadas.

No aceite, decisão, atualização da negociação, união das tags do contato e eventos da outbox são gravados em uma transação serializável com controle otimista da versão da negociação. A decisão registra os valores efetivamente aplicados e a versão resultante. Campos comerciais aplicados recebem as mesmas marcas de confirmação manual usadas pela edição direta.

## ADR-020 — Auditoria manual é append-only e minimizada

Criação e edição manual de contato, mudança de etapa e decisões sobre sugestões geram um `AuditEvent` na mesma transação da mutação. O registro guarda workspace, usuário, ação, campos afetados, versões e transição de etapa quando aplicável. Eventos não são atualizados depois da criação.

A trilha não duplica telefone, observações, conteúdo de mensagens, transcrições ou valores completos de tags. O detalhe da negociação reúne ações vinculadas à negociação e ao contato correspondente, limitado às 50 mais recentes e sempre filtrado pelo workspace autenticado. Exclusão futura por política de privacidade pode remover a referência ao contato ou à negociação sem apagar a identificação do ator e da ação enquanto o workspace existir.

## ADR-021 — Mídia privada usa acesso curto e retenção idempotente

O primeiro adapter de armazenamento grava apenas áudio fictício no filesystem local, fora dos arquivos públicos e com permissões restritas. A chave física nunca é exposta. O navegador obtém uma URL relativa HMAC válida por dois minutos, mas a leitura continua exigindo sessão ativa e revalidação do workspace e da retenção no PostgreSQL.

Cada ativo nasce com prazo configurável. Um processo separado apaga o arquivo antes de minimizar a referência no banco; exclusão ausente é tratada como sucesso e a atualização condicionada torna a rotina repetível. O adapter local valida o contrato do domínio, mas produção deverá usar objeto privado criptografado e preservar a mesma porta, autorização e semântica de retenção.

## ADR-022 — Exclusão de contato usa cascata e tarefa durável de mídia

A ação explícita do administrador bloqueia o contato, registra auditoria e tarefas de mídia, publica uma notificação sanitizada e apaga o agregado em uma transação. As relações removem negociações, mensagens, ativos, análises e decisões; auditorias sobrevivem sem as referências e sem cópia de conteúdo ou identidade pessoal.

O arquivo está fora da transação do PostgreSQL. Por isso, sua chave é copiada para `media_deletion_tasks` antes da cascata. A aplicação tenta removê-lo após o commit e o worker de retenção repete pendências. O acesso é revogado assim que o registro de mídia desaparece, enquanto a tarefa garante a remoção física mesmo depois de falha ou reinício.

## ADR-023 — Mutações web exigem Origin permitido

Cookies de sessão continuam `HttpOnly`, `SameSite=Strict` e `Secure` em produção. Como defesa adicional contra CSRF, toda requisição mutável em `/api/` exige um `Origin` exatamente presente em `APP_ORIGINS`. A lista é explícita e aceita apenas origens HTTP(S), sem caminho, credenciais, query ou fragmento.

Rotas de leitura não dependem de `Origin`. A ingestão `/api/internal/` também fica fora da regra porque usa token próprio e não autenticação ambiente do navegador.

## ADR-024 — Liveness público e readiness interno são separados

O endpoint público `GET /health` informa apenas que o processo HTTP está vivo. A disponibilidade de PostgreSQL e Redis é verificada por `GET /api/internal/health/ready`, protegido pelo mesmo token interno usado entre processos e com resposta sem cache.

O readiness possui prazo curto e retorna somente `ok` ou `unavailable` por dependência; URLs, credenciais e mensagens de erro não são expostas. Falhas operacionais dos workers usam logging JSON estruturado com códigos e nomes sanitizados, sem conteúdo de mensagem, transcrição, telefone, QR ou segredo.

O CI inicia PostgreSQL e Redis e mantém um teste integrado com workspace e prefixo de filas exclusivos. Esse teste valida ingestão idempotente, outbox, BullMQ, análise e evento sanitizado sem disputar jobs com processos locais ou usar provedores externos.

A conclusão de um evento da outbox usa atualização condicional. Se o workspace ou evento for removido entre publicação e confirmação, a ausência é tratada como conclusão idempotente e não encerra o dispatcher.

## ADR-025 — Criação manual de negociação confirma dados comerciais

A interface pode criar uma negociação somente para um contato pertencente ao workspace autenticado. Workspace e usuário autor vêm da sessão; não são aceitos no payload. Valor monetário trafega como decimal em string e, quando fornecido manualmente, já nasce com `valueConfirmedAt`, impedindo que uma extração posterior da IA o sobrescreva.

Negociação, auditoria append-only e `negotiation.created` são persistidos na mesma transação. A auditoria registra apenas os nomes dos campos preenchidos e a etapa resultante. O evento carrega somente workspace, IDs e etapa; título, valor, produto, previsões e próxima ação permanecem no PostgreSQL e são reconciliados pela API autenticada.

## ADR-026 — Campos comerciais possuem confirmação explícita independente

Valor, produto de interesse e previsão de fechamento guardam instantes próprios de confirmação manual. A edição direta e o aceite de uma sugestão atualizam essas marcas, inclusive quando o usuário limpa conscientemente um campo. Assim, ausência confirmada também não pode ser silenciosamente substituída por uma extração posterior.

Edições comerciais exigem a versão esperada da negociação e gravam mutação, auditoria e `negotiation.updated` na mesma transação. O evento informa somente IDs e nomes de campos; valores permanecem no PostgreSQL. Uma decisão de análise continua única e imutável, mas registra separadamente o valor, produto e data efetivamente aplicados para que a trilha não dependa da resposta original do modelo.

## ADR-027 — Próxima ação é estado confirmado da negociação

Cada negociação pode guardar uma próxima ação textual e uma data civil de vencimento, com marcas independentes de confirmação manual. Esses campos podem nascer na criação, ser editados diretamente ou ser selecionados a partir da análise assistiva. A IA nunca cria tarefa nem agenda contato sem o aceite explícito do usuário.

O Kanban classifica o prazo por comparação de datas civis em vencido, hoje ou futuro e continua permitindo ação sem prazo. A API trafega a data em `YYYY-MM-DD`, sem conversão implícita para o fuso do navegador. Alterações seguem o mesmo controle otimista, auditoria minimizada e evento `negotiation.updated` dos demais campos comerciais; texto e data não atravessam a notificação em tempo real.

## ADR-028 — Acompanhamentos concluídos e fechamento são histórico comercial

Concluir uma próxima ação cria um registro imutável com descrição, prazo original, autor e instante, depois limpa os campos atuais na mesma transação com controle otimista. Auditoria e outbox carregam somente nomes de campos e identificadores; o texto permanece no agregado REST autenticado.

Etapas `closed_won` e `closed_lost` exigem motivo explícito. O motivo pertence à negociação e não é copiado para auditoria ou eventos. Reabrir uma negociação limpa `closedAt` e `closeReason`.

## ADR-029 — Dashboard usa agregações do PostgreSQL

Indicadores operacionais não são calculados sobre listas parciais no navegador. O repositório agrega contagens e valores por workspace no PostgreSQL e retorna dinheiro como decimal em string. A taxa de ganho possui janela explícita de 30, 90 ou 365 dias e considera `closedAt`; ausência de fechamentos não é representada como zero percentual.

## ADR-030 — Empacotamento não antecipa adapters reais

As imagens de container separam interface, API, dispatcher, tempo real e retenção, com migrations como tarefa anterior à inicialização. O proxy mantém frontend, REST e Socket.IO na mesma origem e adiciona cabeçalhos defensivos.

Esse empacotamento é uma base operacional reproduzível, não autoriza deploy nem uso de dados reais. WhatsApp, transcrição e IA continuam desabilitados na composição de produção enquanto não houver adapters aprovados, armazenamento de objetos privado e revisão dos requisitos externos.

## ADR-031 — Produção terá como alvo a API oficial do WhatsApp

Para a primeira operação com dados reais, o alvo aprovado de arquitetura é a WhatsApp Cloud API oficial da Meta. O adapter falso continua sendo o único implementado; esta decisão não adiciona credenciais, não conecta conta e não habilita ingestão ou envio real.

A integração inicial será somente de entrada. O webhook deverá validar autenticidade antes de interpretar o payload, normalizar o evento para o contrato interno e persistir mensagem e outbox antes de baixar mídia ou publicar jobs. O endpoint de envio permanecerá ausente até existir uma decisão separada sobre consentimento, templates, autorização humana e auditoria.

Esta decisão substitui Baileys como caminho pretendido para produção na ADR-008. A porta de domínio permanece independente do SDK da Meta. Antes da implementação ainda são necessários conta controlada, credenciais, revisão contratual e de privacidade e autorização explícita para adicionar um provedor que receba conversas.
