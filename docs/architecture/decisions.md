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

O usuário pode aceitar uma seleção editável de etapa e tags ou ignorar uma análise concluída. Cada análise possui no máximo uma decisão, vinculada ao usuário autenticado. Um UUID fornecido pelo cliente permite reentrega idempotente; decisões diferentes para a mesma análise são recusadas.

No aceite, decisão, atualização da negociação, união das tags do contato e eventos da outbox são gravados em uma transação serializável com controle otimista da versão da negociação. A decisão registra os valores efetivamente aplicados e a versão resultante. Entidades de valor, produto e prazo continuam apenas informativas até receberem contratos próprios de confirmação e precedência manual.
