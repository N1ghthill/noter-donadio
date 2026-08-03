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

Cada mensagem recebe no máximo uma análise por tipo e versão do prompt. A
primeira versão usava somente o texto da mensagem corrente ou sua transcrição
concluída; a ampliação mínima e limitada de contexto é definida pela ADR-075.
O worker adquire um lease persistido por tentativa e valida a resposta contra
uma lista fechada de campos, enumerações e limites antes de gravá-la.

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

## ADR-031 — Produção terá como alvo a API oficial do WhatsApp [substituída pela ADR-051]

Para a primeira operação com dados reais, o alvo aprovado de arquitetura é a WhatsApp Cloud API oficial da Meta. O adapter falso continua sendo o único implementado; esta decisão não adiciona credenciais, não conecta conta e não habilita ingestão ou envio real.

A integração inicial será somente de entrada. O webhook deverá validar autenticidade antes de interpretar o payload, normalizar o evento para o contrato interno e persistir mensagem e outbox antes de baixar mídia ou publicar jobs. O endpoint de envio permanecerá ausente até existir uma decisão separada sobre consentimento, templates, autorização humana e auditoria.

Esta decisão substitui Baileys como caminho pretendido para produção na ADR-008. A porta de domínio permanece independente do SDK da Meta. Antes da implementação ainda são necessários conta controlada, credenciais, revisão contratual e de privacidade e autorização explícita para adicionar um provedor que receba conversas.

## ADR-032 — Exportação do workspace é versionada, auditada e sem segredos

O administrador pode baixar um documento JSON `workspace-export-v1` com os dados funcionais do workspace. A consulta e o registro `workspace_exported` pertencem à mesma transação com snapshot repetível; o workspace e o usuário derivam exclusivamente da sessão.

A exportação contém usuários sem hashes, contas sem credenciais, contatos, negociações, acompanhamentos, mensagens, metadados de mídia sem chave física, transcrições, análises, decisões e auditoria. Sessões, hashes de conteúdo, chaves de autenticação, chaves de armazenamento, outbox, leases e tarefas internas não são exportados.

O endpoint é administrativo, limitado por taxa, impede cache e força download. A versão síncrona atende o volume do MVP; antes de workspaces grandes, deverá ser substituída por geração assíncrona paginada em armazenamento privado, com expiração curta e a mesma seleção explícita de campos.

## ADR-033 — Auditoria global usa projeção minimizada

A área administrativa consulta as ações auditáveis mais recentes de todo o workspace, não apenas eventos ligados a uma negociação existente. O endpoint deriva o workspace da sessão administrativa, desabilita cache, limita a consulta a no máximo 100 registros e permite filtrar apenas pela lista fechada de ações.

A projeção expõe ator, instante, referências internas opcionais, campos afetados, versões e detalhes presentes em uma allowlist. Valores comerciais, tags completas, identidade do contato, mensagens, transcrições e propriedades desconhecidas de `details` não atravessam a resposta.

O MVP mostra os 50 eventos mais recentes. Paginação estável e política de retenção da auditoria permanecem requisitos anteriores a grandes volumes.

## ADR-034 — Métricas operacionais são agregadas e privadas

`GET /api/internal/metrics` expõe formato Prometheus somente após autenticação pelo token interno. O proxy público bloqueia todo o prefixo `/api/internal/`; monitoramento, readiness e ingestão acessam a API diretamente pela rede privada.

As métricas agregam estados da outbox, transcrição, análise, tarefas de exclusão de mídia, idade do item pendente mais antigo e contagens fechadas das três filas BullMQ. Não existem labels de workspace, contato, negociação, mensagem, telefone, modelo ou código de erro, evitando alta cardinalidade e vazamento de dados.

Falha no PostgreSQL ou Redis faz a coleta retornar `503` com corpo genérico. Métricas complementam logs e readiness, mas não substituem o PostgreSQL como fonte de verdade nem autorizam descarte automático de jobs falhos.

## ADR-035 — Observabilidade local é versionada e isolada

Prometheus coleta o endpoint privado diretamente na rede da composição e lê `x-internal-token` de um secret montado, sem incorporar a credencial na configuração. Grafana recebe datasource e dashboard por provisionamento versionado. Ambas as interfaces ficam vinculadas a `127.0.0.1`, usam volumes próprios e não recebem labels com identificadores de negócio.

As regras iniciais cobrem disponibilidade, atraso do outbox e dos pipelines assistivos, falhas de jobs e pendências de exclusão de mídia. Elas são acompanhadas por runbooks, mas não existe destino de notificação nesta etapa. Alertmanager, exposição por TLS e qualquer integração externa dependem de decisão operacional e aprovação de segurança separadas.

## ADR-036 — Alertmanager local valida roteamento sem notificar terceiros

O perfil de observabilidade inclui Alertmanager com versão fixada, armazenamento próprio e acesso somente por loopback. Prometheus envia os alertas pela rede privada; Grafana recebe um datasource provisionado e não editável. Receivers locais separam avisos e críticos, agrupam eventos equivalentes e não possuem e-mail, chat ou webhook configurado.

Backlogs críticos inibem apenas os avisos equivalentes quando `component`, `alert_class` e `pipeline` coincidem. Um exercício sintético confirma recebimento e resolução sem consultar dados de negócio. Esta decisão implementa localmente a etapa deixada pendente na ADR-035; TLS, alta disponibilidade, destinatários reais e credenciais continuam sujeitos a aprovação separada.

## ADR-037 — Identidade de rede é confiada somente ao proxy empacotado

O backend habilita `trustProxy` apenas no processo configurado como produção, que não publica sua porta no host e recebe tráfego web pelo Nginx da mesma composição. O Nginx sobrescreve `X-Forwarded-For` com o endereço do par que abriu a conexão, impedindo que um cliente forneça arbitrariamente a chave usada pelos limites de login e exportação.

Quando houver um terminador TLS externo, ele deverá acessar o Nginx por rede restrita. A topologia, os intervalos confiáveis e a propagação do endereço original precisam ser definidos antes de configurar limites adicionais no proxy; não será aceita confiança irrestrita em uma cadeia de cabeçalhos fornecida pelo cliente.

## ADR-038 — Prisma avança como conjunto alinhado

O CLI, o client e o adapter do Prisma ficam alinhados em `7.9.1`. Essa versão remove os achados transitivos observados nas tentativas anteriores com `7.8.0` e `7.9.0`, sem exigir override de pacote. A combinação completa é validada por geração do client, migrations em banco vazio, testes integrados e build.

Prisma CLI, client e adapter devem continuar avançando juntos. Um upgrade só é aceito depois de instalação limpa e validação de schema, migration, testes e auditoria; correções transitivas isoladas não podem produzir uma combinação de versões não suportada.

## ADR-039 — A fase compartilhada usa uma única VPS sem classificá-la como produção

Aplicação, PostgreSQL, Redis e workers compartilham uma VPS enquanto a carga é baixa e somente dados fictícios são permitidos. Banco e filas ficam em rede Docker privada, volumes são persistentes, logs possuem rotação e todos os processos backend reutilizam a mesma imagem. A indisponibilidade do host afeta todo o sistema e é um risco aceito apenas nesta fase.

O perfil usa adapters falsos. Git permanece a fonte de verdade; deploys exigem checkout limpo, snapshot prévio, migration controlada e smoke test. Snapshot no próprio host não é recuperação de desastre, portanto backup off-host, alertas com destino real, mídia externa e revisão de segurança continuam bloqueando dados reais.

## ADR-040 — O domínio da fase compartilhada termina TLS no Caddy

`leadcontrol.online` aponta diretamente para a VPS. O Caddy é o único serviço web publicado, redireciona HTTP para HTTPS, administra o certificado e encaminha `/api` e `/socket.io` diretamente ao backend; o frontend Nginx fica restrito à rede Docker. O prefixo `/api/internal` é recusado antes de qualquer proxy.

O backend executa com `NODE_ENV=production`, emite cookie `Secure` e aceita mutações somente da origem HTTPS explícita. A porta do backend não é publicada e o Caddy substitui cabeçalhos de encaminhamento recebidos do cliente antes de informar o endereço original ao backend. Estado ACME fica em volume persistente; perder esse volume não perde dados de negócio, mas pode causar nova emissão e limites da autoridade certificadora.

## ADR-041 — Backup somente na VPS é dívida aceita para dados fictícios

Durante a continuidade de implementação e demonstração com dados fictícios, os snapshots automáticos permanecem no mesmo host. A justificativa é reduzir custo e complexidade nesta fase; o impacto aceito é perder aplicação, banco, mídia e todos os snapshots em uma única falha da VPS.

A exceção termina antes de qualquer dado real. A condição de remoção é configurar cópia off-host criptografada, retenção definida e exercício documentado de restauração. Snapshot local continua obrigatório antes de deploys mesmo durante a exceção.

## ADR-042 — Acesso operacional substitui login remoto de root

A VPS aceita SSH somente por chave para o usuário `noterops`; senha, interação de teclado e login remoto de `root` ficam desabilitados. O usuário não pertence aos grupos `sudo` ou `docker`. O sudoers permite apenas atualizar `/opt/noter-donadio` por fast-forward e executar os scripts versionados de deploy, status, backup e homologação.

O firewall persistente usa uma tabela `nftables` própria, sem limpar regras administradas pelo Docker. A entrada do host fica fechada por padrão e permite somente conexões estabelecidas, loopback, ICMP, SSH e web. Alterações futuras devem validar uma segunda sessão antes de recarregar SSH ou firewall.

## ADR-043 — A fronteira da Meta é preparada antes de publicar o webhook [substituída pela ADR-051]

A primeira unidade da WhatsApp Cloud API é um adapter puro que valida assinatura HMAC-SHA256 sobre o corpo bruto, valida o desafio de inscrição e normaliza somente mensagens recebidas de texto e áudio. Payload, SDK e nomenclatura da Meta não atravessam essa fronteira; eventos de status e tipos fora do MVP não geram mensagens.

O módulo permanece sem rota e sem configuração de ativação. Publicar o webhook exige primeiro garantir captura limitada dos bytes originais, resolução inequívoca entre número empresarial, conta e workspace, persistência atômica da mensagem e da referência de mídia, download somente após commit, observabilidade agregada e segredo externo. Nenhuma credencial ou chamada real é introduzida por esta decisão.

## ADR-044 — O webhook Meta nasce desligado e aceita inicialmente somente texto [substituída pela ADR-051]

O backend possui `GET|POST /api/whatsapp/webhook`, mas registra as rotas apenas
quando `META_WEBHOOK_ENABLED=1` e ambos os segredos obrigatórios estão
presentes. O padrão permanece desligado. O POST limita o corpo bruto a 1 MiB,
valida a assinatura antes do parse, aplica rate limit e não depende de
`Origin`, pois sua autenticidade vem da assinatura do provedor.

Uma conta da Meta é resolvida pela combinação de provedor, WABA e identificador
do número empresarial. O identificador do número é único por provedor e o
vínculo só aceita conta conectada, produzindo workspace e conta internos antes
da ingestão. Texto usa a transação e a outbox existentes, preservando
idempotência. Conta ausente retorna indisponibilidade temporária sem aceitar o
evento.

Áudio permanece normalizado, mas retorna `503` antes de persistir qualquer
item do lote. A condição de remoção é persistir a referência de mídia junto da
mensagem e implementar download privado posterior ao commit antes de publicar
transcrição. Não existe endpoint de envio, credencial versionada, conta real
ou chamada à Meta nesta decisão.

## ADR-045 — Download de mídia antecede a transcrição e possui lease próprio

Áudio externo cria a mensagem, um `MediaAsset` com referência externa e estado
de download `pending`, além de `message.audio.download_requested`, na mesma
transação. A outbox publica somente IDs internos na fila `media-download`. O
worker resolve a referência no PostgreSQL, adquire lease por tentativa e grava
a mídia privada antes de concluir o estado de download.

Somente a conclusão condicional da tentativa cria `message.audio.ingested`,
que libera a fila de transcrição. Assim, reentrega não baixa nem transcreve
novamente e uma transcrição não pode reivindicar mídia sem download concluído
e chave privada presente. Falhas usam código sanitizado e permanecem visíveis
por estado, idade e métricas agregadas.

O adapter falso gera apenas áudio sintético e serve à homologação do pipeline.
O conector real mantém áudio desligado até existir referência durável,
downloader autenticado, limites confirmados e revisão de retenção. Jobs não
carregam credencial, telefone, bytes ou conteúdo.

Uma falha indeterminada entre a gravação privada e a confirmação no banco pode
deixar um objeto órfão identificado pela tentativa, sem sobrescrever mídia já
confirmada. Essa dívida é aceita somente com dados fictícios; antes do adapter
real, uma rotina de reconciliação deve remover objetos sem referência após uma
janela segura e preservar os objetos ligados a tentativas concluídas.

## ADR-046 — Adapter Meta é compilado, mas ativação continua operacional [substituída pela ADR-051]

O adapter de mídia da Meta executa duas leituras autenticadas: resolve a URL
temporária pelo ID externo e baixa os bytes usando autenticação Bearer nas duas
requisições. O token permanece fora do banco, dos jobs, das URLs e dos logs. O
worker valida a conta provedora, versão explícita da Graph API, HTTPS, hosts de
mídia, redirecionamentos, timeout, MIME e limite de bytes.

O perfil compartilhado continua usando somente o adapter falso. No perfil de
produção, o worker real é opt-in e recebe o token apenas em seu próprio
processo. Habilitar webhook, worker ou credencial real exige uma mudança
operacional separada, revisão do escopo `whatsapp_business_messaging`, teste
controlado com fixture não sensível e confirmação da política de retenção.

## ADR-047 — Audit de produção aceita uma única exceção semântica e temporária

O CI continua executando `npm audit --omit=dev`, mas interpreta o relatório com
uma allowlist fechada. A única exceção aceita é
`GHSA-qwww-vcr4-c8h2` em `react-router` e sua propagação direta para
`react-router-dom`, pois o advisory afeta as APIs instáveis de React Server
Components e esta aplicação usa uma SPA com `BrowserRouter`, sem RSC.

Qualquer outro pacote, advisory, formato inesperado ou falha de consulta reprova
o CI. A exceção deve ser removida assim que existir versão compatível corrigida
no registro usado pelo projeto, ou antes de introduzir RSC.

## ADR-048 — Tentativas de mídia órfãs são removidas após janela segura

O processo de retenção também lista somente arquivos regulares com chave
`<workspace UUID>/<tentativa UUID>.media`. Um lote consulta o PostgreSQL e
remove apenas chaves sem referência e com modificação anterior à janela de
segurança, configurada em 24 horas por padrão. WAVs de demonstração, arquivos
recentes, links e nomes fora do contrato são ignorados.

A janela evita disputar com downloads e confirmações ainda em andamento. A
varredura não registra chaves, workspaces ou nomes físicos; somente a contagem
agregada de remoções. O PostgreSQL permanece a autoridade para distinguir mídia
confirmada de tentativa abandonada.

## ADR-049 — Entrada real não satisfaz a captura de mensagens enviadas [substituída pela ADR-051]

A primeira ativação da Meta continua limitada a mensagens recebidas. Status de
entrega, leitura ou template não serão transformados em mensagens enviadas,
porque não preservam necessariamente o conteúdo original nem demonstram ação
humana.

Capturar mensagens enviadas pelo próprio usuário permanece requisito do MVP e
gap explícito da integração real. Fechá-lo exige uma fonte oficial que preserve
identidade, direção, conteúdo e ID externo, além de nova decisão sobre
consentimento, auditoria e idempotência. Até lá, o fluxo completo existe apenas
no domínio e nos testes, não na ativação Meta.

## ADR-050 — Segredos e áudio Meta seguem privilégios e kill switches separados [substituída pela ADR-051]

O segredo de verificação e o segredo do aplicativo da Meta são necessários
somente na API que recebe o webhook. Os demais processos recebem
`META_WEBHOOK_ENABLED=0` e não recebem essas credenciais. O token de acesso e a
versão da Graph API continuam exclusivos do worker `media-download`.

Texto pode ser ativado sem habilitar áudio. Áudio exige adicionalmente
`META_WEBHOOK_AUDIO_ENABLED=1` e deve ser ligado no mesmo deploy controlado que
o worker real de download. Os dois switches permanecem desligados por padrão;
uma configuração de áudio ativo com webhook desligado impede a inicialização.

## ADR-051 — Baileys volta a ser o único caminho de conexão real

Por decisão do produto, a integração real retorna ao Baileys e as ADRs 031,
043, 044, 046 e 050 deixam de orientar o runtime. Rotas de webhook, adapters,
segredos, configuração e download específicos da API oficial foram removidos.
Nenhuma sessão Baileys foi conectada por esta decisão.

O conector usará uma release 7 fixada e um processo dedicado. O auth state será
implementado no PostgreSQL, com cada credencial e chave Signal criptografada
por AES-256-GCM e chave externa ao banco. `useMultiFileAuthState`, logger padrão,
histórico completo e envio autônomo são proibidos em produção.

Eventos de texto serão normalizados atrás de uma porta sem importar o SDK no
domínio. `fromMe` determina `outbound`, permitindo preservar também mensagens
enviadas pelo usuário. Grupos, status, newsletters e eventos de protocolo são
descartados antes da ingestão. Áudio exige uma decisão adicional sobre
referência durável e download pós-commit.

As migrations 202607280001 e 202607280002 já foram compartilhadas. O pipeline
genérico de download da segunda permanece útil; colunas e constraint do
experimento anterior ficam sem uso. Elas não serão apagadas até existir
autorização explícita para uma migration destrutiva em ambiente compartilhado.

Antes de conectar uma conta real, o auth state transacional deve ser integrado
ao socket e validado sob concorrência; também devem ser concluídos QR efêmero
autenticado, reconexão, observabilidade sanitizada, auditoria da versão fixada,
aceite dos termos e teste com número controlado.

## ADR-052 — A base Baileys nasce sem ativação de rede

A primeira entrega do conector fixa `baileys@7.0.0-rc13`, adiciona isolamento
explícito por workspace às chaves de autenticação e implementa
`AuthenticationState` no PostgreSQL. Credenciais e Signal keys são serializadas
com o codec do Baileys e criptografadas individualmente com AES-256-GCM; a AAD
vincula versão do formato, workspace, conta, categoria e identificador da
chave. Um lote de alterações de Signal keys é persistido em uma única
transação.

O cipher aceita chaves antigas para leitura e usa uma versão ativa nas novas
gravações, permitindo rotação posterior sem plaintext. A configuração dedicada
exige UUIDs de workspace e conta e chave base64 canônica de 32 bytes.

A release atual possui declarações transitivas incompatíveis com
`moduleResolution: NodeNext`; por isso somente a verificação de declarações de
dependências está ignorada no backend por `skipLibCheck`, enquanto todo código
do projeto continua sob TypeScript estrito. A versão fica fixada e deverá ser
reavaliada antes de sair do RC.

Esta decisão não cria socket, não gera QR real, não conecta sessão e não envia
mensagens. A ativação de rede continua dependendo de processo dedicado,
observabilidade sanitizada, teste controlado e autorização explícita.

## ADR-053 — Socket Baileys opera em processo dedicado com controle efêmero no Redis

Após autorização explícita para a fase na VPS, o socket passa a executar em um
processo dedicado. PostgreSQL continua sendo a fonte de verdade para conta,
estado de conexão, auth state e mensagens. Redis guarda somente QR com TTL de
60 segundos e o comando de reinício da sessão; nenhum conteúdo de conversa ou
credencial trafega por ele.

A biblioteca usa logger silencioso, não sincroniza histórico completo e não
marca o usuário online ao conectar. Apenas `messages.upsert` do tipo `notify`
entra no MVP. Texto de conversas diretas é normalizado, incluindo `fromMe`, e
segue para a transação idempotente já existente. Grupos, status, newsletters,
protocolo, mídia ainda sem contrato durável e LID sem identidade telefônica
resolvida são ignorados. Não existe endpoint de envio.

Falhas transitórias reiniciam o socket; logout, sessão inválida, substituição da
conexão e proibição são terminais. O QR é retornado somente por rota
autenticada com `cache-control: no-store`. Áudio real permanece como próximo
bloco porque seus dados de download precisam ser criptografados e persistidos
antes da publicação do job.

## ADR-054 — Versão do protocolo WhatsApp Web é explícita

O socket retornou `405` antes de emitir QR porque a versão de protocolo
embutida em `baileys@7.0.0-rc13` estava defasada. A versão corrente verificada
pelo mecanismo do próprio Baileys foi fixada em `2.3000.1043857760` e pode ser
alterada por `BAILEYS_PROTOCOL_VERSION` sem trocar a release da biblioteca.

A configuração aceita somente três inteiros separados por ponto e é passada
explicitamente ao socket. O processo não consulta `master` do GitHub a cada
inicialização; mudanças futuras exigem validação e atualização operacional
consciente.

## ADR-055 — Mensagem própria em `append` exige corte temporal da conexão

O Baileys pode entregar mensagens enviadas pelo telefone principal como
`append`, inclusive no autochat. Ignorar todo `append` perde mensagens
`outbound`; aceitá-lo sem filtro importaria histórico.

O conector aceita todo `notify`, mas aceita `append` somente quando
`fromMe=true`, existe uma conexão aberta nesta execução e o horário da mensagem
é igual ou posterior à abertura. Entregas antigas, mensagens recebidas em
`append` e eventos anteriores ao estado conectado continuam descartados. A
chave externa da mensagem mantém a ingestão idempotente.

Identidades `@lid` sem `remoteJidAlt` são resolvidas pelo contato da própria
sessão no autochat ou pelo `LIDMappingStore` do Signal. Se não houver um JID
telefônico verificável, a mensagem continua descartada; o identificador opaco
jamais é gravado como telefone.

## ADR-056 — Áudio Baileys usa referência mínima cifrada e download pós-commit

Uma mensagem de áudio é normalizada pelo processo Baileys com a mesma regra de
identidade, direção e corte temporal do texto. Na transação de ingestão, o
sistema persiste mensagem, `MediaAsset` pendente, referência mínima cifrada e
outbox. A referência contém somente `url`, `directPath` e `mediaKey` necessários
ao download; usa AES-256-GCM com a chave externa da sessão, formato próprio e
AAD vinculada a workspace, conta e ID externo da mensagem.

O job BullMQ continua carregando somente IDs internos. Um worker separado
reabre a referência no PostgreSQL, limita download a 30 segundos e
`MEDIA_MAX_BYTES`, grava uma tentativa no volume privado e só então confirma o
ativo e libera a transcrição. Leases, chave física por tentativa e reconciliação
de órfãos mantêm retry e idempotência.

Adapters `fake` de análise e transcrição são exclusivos do profile `demo`.
Quando o profile `baileys` está ativo, somente o downloader Baileys é iniciado;
análise e transcrição reais permanecem desligadas até a aprovação de adapters
específicos. Jobs pendentes preservam a mensagem original e não produzem
sugestões ou transcrições inventadas.

Na fase atual, banco, Redis e mídia privada compartilham a VPS e os snapshots
permanecem no próprio host por risco aceito pelo proprietário. Essa topologia
não oferece recuperação contra perda integral da VPS e deverá ser revista antes
de uma operação que exija disponibilidade ou recuperação de desastre.

## ADR-057 — Capacidades assistivas são explícitas e falham fechadas

A API autenticada expõe somente três capacidades booleanas de produto:
simulação local, transcrição de áudio e análise de mensagens. Elas não revelam
adapter, modelo, segredo, fila ou configuração interna. A interface usa essas
capacidades para não oferecer simulação no ambiente Baileys e para diferenciar
um recurso desativado de um processamento realmente pendente.

`TRANSCRIPTION_FEATURE_ENABLED` e `AI_ANALYSIS_FEATURE_ENABLED` começam em
`false` e são independentes da seleção do adapter no processo worker. Falha ao
consultar a capacidade é tratada como recurso desligado. Um deploy futuro só
pode mudar a capacidade para `true` junto da inicialização saudável do worker
correspondente.

Antes dessa ativação, o proprietário deve decidir separadamente se jobs
acumulados serão descartados do processamento assistivo ou processados pelo
novo provedor. A decisão deve considerar finalidade, custo e transmissão de
dados antigos; não haverá consumo retroativo silencioso.

## ADR-058 — OpenAI processa somente a janela explicitamente autorizada

Em 29/07/2026, o proprietário aprovou OpenAI para transcrever o áudio real mais
recente usado na homologação e analisar apenas mensagens a partir desse
instante. O backlog anterior não está autorizado.

Transcrição usa por padrão `gpt-4o-mini-transcribe` no endpoint de upload de
arquivo. Análise usa por padrão `gpt-5.6-sol` na Responses API, Structured
Outputs, `store: false` e o prompt versionado `message-extraction-v1`. Modelos,
timeout, retries e limites são configuráveis, mas não há fallback automático
para outro provedor ou modelo.

Quando qualquer adapter OpenAI inicia, `ASSISTIVE_PROCESSING_NOT_BEFORE` é
obrigatório. O repositório verifica `Message.createdAt` antes de adquirir o
lease ou chamar o adapter. Reentrega BullMQ, reinício ou job acumulado anterior
ao corte termina como ignorado sem transmissão externa. A ativação interativa
seleciona como corte a mídia Baileys real mais recente, marca mídias antigas
pendentes com código sanitizado e preserva mensagem e áudio originais.

A chave é lida sem eco pelo TTY, permanece no `.env` da VPS com modo `600` e é
injetada somente nos dois workers. Jobs e eventos continuam contendo apenas
IDs; logs não recebem conteúdo, arquivo, transcrição ou segredo.

## ADR-059 — Sessão conectada não inicia novo setup

`POST /api/whatsapp/setup` existe apenas para uma conta sem sessão ativa.
Quando o estado persistido é `connected`, a API responde
`409 already_connected` antes de alterar estado ou publicar comando Redis. A
interface não apresenta o botão de setup nesse estado.

Desconexões transitórias são responsabilidade da reconexão Baileys com auth
state existente. Um novo QR não é tratado como retry e somente poderá ser
solicitado depois que a sessão estiver efetivamente desconectada. Isso evita o
fluxo observado em que uma conta saudável era colocada em setup, aguardava o
timeout do QR e mostrava erro ao usuário.

## ADR-060 — Substituição de número separa reset de autenticação e novo QR

Uma sessão encerrada de forma terminal pode manter auth state cifrado no banco.
Reutilizá-lo em um novo setup repetiria o erro terminal e impediria o
pareamento de outro número. A preparação da troca é, portanto, uma mutação
explícita e separada de `setup`.

O endpoint exige sessão administrativa e confirmação do `accountId`, recusa
conta ainda conectada e, em transação serializável, remove somente
`WhatsappAuthKey`, limpa o telefone, mantém a conta desconectada, registra
`whatsapp_auth_reset` e cria o evento de reconciliação. Contatos, negociações,
mensagens e mídias não são alterados. A ação não publica comando ao processo
Baileys e o QR só será gerado posteriormente por outra ação do usuário.

## ADR-061 — Visões operacionais derivam dos agregados existentes

Home, controle, agenda, conversas e arquivos são projeções dos mesmos contatos,
negociações, mensagens, análises e mídias do CRM. Não existe uma tabela
paralela de tarefas no MVP: a tarefa ativa é `nextAction` e seu prazo pertence
à negociação; a conclusão continua produzindo o histórico imutável já
existente.

Uma conversa é considerada iniciada no instante da primeira mensagem
persistida da negociação. O navegador converte os limites do dia local para
UTC, e o PostgreSQL aplica o intervalo semiaberto `[início, fim)`. A
classificação exibida é a sugestão de etapa da análise concluída mais recente.
Ela permanece identificada como sugestão e nunca altera `stage` sem aceite
explícito. O resumo também vem dessa análise; na ausência dela, a interface
informa que nenhum resumo foi produzido, sem criar fallback artificial.

O catálogo de arquivos lista somente mídias privadas acessíveis, não removidas
e ainda dentro da retenção. Ele expõe metadados e IDs internos, nunca
`storageKey`; a reprodução continua usando URL curta, assinada, autenticada e
vinculada ao workspace. Upload de documentos e uma agenda independente ficam
fora desta decisão até existirem requisitos de domínio que justifiquem novos
agregados.

## ADR-062 — Imagens e documentos usam o mesmo pipeline privado de mídia

Imagens e documentos novos do Baileys seguem a mesma garantia já aplicada ao
áudio: mensagem, ativo pendente, referência mínima cifrada e outbox são
persistidos na mesma transação; o download só acontece depois do commit e o job
transporta apenas IDs. `MediaAsset.originalFileName` preserva o nome informado
pelo WhatsApp depois de remover caminho e caracteres de controle.

O downloader aceita áudio, JPEG, PNG, WebP, GIF, PDF, texto, CSV, ZIP e os
formatos usuais de Microsoft Office. HTML e SVG são recusados para impedir
conteúdo ativo sob a origem autenticada da aplicação. Imagens podem ser
exibidas inline; documentos sempre usam `Content-Disposition: attachment`.
Ambos dependem de sessão, workspace, assinatura HMAC e prazo curto, sem URL
pública ou chave física de armazenamento.

Mídias não sonoras não entram na fila de transcrição. Ao concluir seu download,
um evento sanitizado `message.media.available`, contendo apenas IDs, solicita
reconciliação REST da interface. Upload manual e compartilhamento externo
continuam fora desta fase.

## ADR-063 — Conversas são agrupadas pela pessoa, não pela negociação

O Baileys pode representar o mesmo número por um JID telefônico ou por LID.
Depois de resolver o telefone pelo mapping store, o adapter passa adiante o JID
telefônico canônico. A ingestão procura primeiro essa identidade e, quando ela
ainda não existe, reutiliza um contato do mesmo workspace com o mesmo telefone
normalizado, dando precedência ao contato criado manualmente. O JID bruto não
volta a criar uma pessoa paralela.

A rota de listagem de conversas agrupa mensagens pelo telefone normalizado do
contato. O detalhe aberto a partir dessa tela usa escopo de contato e reúne, em
ordem cronológica, mensagens e mídias das negociações que pertencem à mesma
pessoa. Pipeline e detalhe comercial continuam preservando negociações
separadas: a alteração é de identidade conversacional e não mescla, apaga ou
reescreve silenciosamente dados comerciais existentes.

Uma eventual consolidação física de contatos ou negociações exige ferramenta
própria, confirmação explícita, auditoria e regras para resolver campos
comerciais divergentes. Ela não é executada automaticamente por esta decisão.

## ADR-064 — Listagens operacionais usam paginação por offset explícita

Contatos, negociações, conversas e arquivos aceitam `limit` e `offset` e
retornam `hasMore` e `nextOffset`. O detalhe comercial pagina mensagens por
`messageLimit` e `messageOffset`, sempre buscando do registro mais recente para
o mais antigo e devolvendo cada página em ordem cronológica. O navegador
concatena por ID e o estado completo continua reconciliável pela API REST.

Offset foi escolhido para o volume atual do MVP e por manter filtros e telas
simples. Antes de volumes que tornem páginas profundas relevantes, a condição
de migração é adotar cursor estável composto por data e ID.

## ADR-065 — Acesso de mídia expira e pode ser renovado

`retentionUntil` faz parte das projeções de arquivos e mensagens. Áudio, imagem
e documento continuam sem URL pública permanente: cada ação solicita uma URL
curta vinculada à sessão e ao workspace. Erro de reprodução ou expiração limpa
a URL no navegador e permite nova solicitação. Renovar o acesso não altera a
retenção do ativo.

## ADR-066 — Consolidação física de contato é explícita e auditada

Cadastro e edição manual recusam outro contato do mesmo workspace com telefone
normalizado já existente. Duplicados históricos ainda podem existir por
identidades técnicas antigas; a interface só oferece consolidação quando os
telefones coincidem e exige confirmação do contato de origem.

A transação bloqueia os dois contatos, preserva mensagens e negociações,
combina tags e observações, mantém o JID telefônico quando disponível, move a
auditoria anterior, remove o duplicado e grava `contact_merged` e
`contact.merged`. Se houver mais de uma negociação ativa no conjunto, a ação
recusa: escolher qual oportunidade encerrar é uma decisão comercial humana.

## ADR-067 — Alertas respeitam capacidades assistivas deliberadamente desligadas

As métricas publicam `noter_pipeline_enabled` para download, transcrição e
análise. A idade pendente de uma capacidade desligada é exposta como zero e as
regras de backlog exigem o indicador habilitado. Mensagens e mídias originais
permanecem preservadas, mas a ausência intencional de chave OpenAI não produz
um falso incidente operacional.

## ADR-068 — Pendências e homologação não criam novos dados de negócio

A central de pendências da interface soma próximas ações vencidas, previstas
para hoje e ausentes a partir da projeção autenticada do dashboard. Seus links
abrem os filtros correspondentes da Agenda. Não há tabela, fila ou contador
persistido paralelo; eventos em tempo real apenas solicitam nova leitura REST.
Uma falha nessa leitura aparece como indisponibilidade e não como ausência de
pendências.

O checklist do piloto é uma ajuda de navegação armazenada somente no navegador.
Ele não representa aceite formal, não entra na auditoria e não altera a fonte
de verdade comercial. Evidências, severidade e decisão de saída continuam no
processo operacional documentado.

Os indicadores de entrada e resultado permanecem agregações PostgreSQL
isoladas por workspace. Contatos e negociações usam `createdAt`; valor ganho,
ticket médio e conversão usam somente negociações fechadas como ganhas dentro
da janela por `closedAt`. Dinheiro continua trafegando como decimal em string.

## ADR-069 — Recuperação de mídia expirada pertence ao socket Baileys dedicado

O worker de download não abre uma segunda sessão WhatsApp. Quando a primeira
tentativa falha com `403`, `404` ou `410`, ele publica uma solicitação efêmera
contendo somente workspace, conta, mensagem e UUID. O processo Baileys já
conectado reconstrói o envelope mínimo, chama `updateMediaMessage` e grava a
nova referência cifrada. O resultado efêmero informa apenas sucesso ou falha;
bytes, JID, URL, chave e conteúdo não atravessam o Redis.

O JID técnico original da chave da mensagem é incluído na referência
AES-256-GCM para permitir retry de conversas LID sem substituir a identidade
canônica do contato. Referências antigas sem esse campo usam o JID canônico
como fallback. A renovação ocorre no máximo uma vez por execução e nunca é
tentada para limite de tamanho, MIME inválido, erro criptográfico ou timeout
local. Falhas permanecem sob a política idempotente do BullMQ e não removem a
mensagem nem o ativo pendente.

## ADR-070 — A superfície web usa política restritiva sem exceção para estilo inline

A interface usa somente arquivos de estilo e script gerados pelo próprio
frontend. A barra de progresso nativa evita atributos `style`, permitindo
remover `unsafe-inline` da política de estilos. Conexões WebSocket públicas são
restritas ao domínio HTTPS configurado, sem liberar os esquemas `ws:` ou `wss:`
de forma global.

Caddy e Nginx também publicam isolamento de origem e bloqueio de frames. O
diagnóstico operacional pode consultar no PostgreSQL apenas o estado agregado
das contas Baileys (`connected`, `disconnected` ou `not_configured`); telefone,
JID, conteúdo, QR e credenciais não fazem parte dessa saída.

## ADR-071 — Ativação OpenAI valida acesso antes de alterar o ambiente

O configurador interativo valida o formato local da chave e consulta somente o
endpoint autenticado de metadados para cada modelo configurado. A chave segue
pelo `stdin` do cliente HTTP, nunca por argumento de processo, log ou arquivo
versionado. Falha de rede, autenticação, modelo indisponível ou identificador
inseguro preserva integralmente a configuração anterior.

Somente depois dessas validações o script grava o segredo com permissão `600`,
define o corte temporal e habilita os workers. Essa consulta não realiza
inferência nem substitui a homologação controlada de texto e áudio. O
diagnóstico assistivo informa contagens rotuladas por estado, sem conteúdo,
telefone, mensagem, transcrição ou identificador de negócio.

## ADR-072 — O runtime Baileys não preserva mapeamento legado da Meta

Baileys permanece como único caminho de conexão real. Os identificadores de
conta específicos da Meta, que já não possuíam consumidor, são removidos do
schema atual e do contrato de download de mídia. A migration preserva o
histórico anterior, mas interrompe a aplicação se encontrar um mapeamento Meta
preenchido; dados desconhecidos não são descartados silenciosamente.

O alvo de download contém somente IDs internos, referência externa cifrada,
tipo e MIME esperados. A escolha do adapter ocorre na composição do processo,
sem campo específico de provedor no domínio.

Referências opcionais da auditoria para contato e negociação passam a usar
chaves compostas com `workspaceId`. Como a trilha deve sobreviver à exclusão do
agregado, o fluxo de privacidade remove explicitamente essas referências na
mesma transação antes da exclusão. Assim, o banco impede vínculos cruzados entre
workspaces sem enfraquecer a auditoria minimizada.

## ADR-073 — Falhas assistivas exigem diagnóstico sanitizado e retry humano

Workers de análise e transcrição classificam falhas externas usando apenas
nome técnico, código e status: autenticação, permissão, limite, modelo, timeout,
indisponibilidade, requisição, entrada ou saída inválida. Mensagens brutas de
erro e conteúdo de negócio não são persistidos nem registrados. O evento final
do BullMQ registra somente código seguro, ID interno do job e número da
tentativa.

Não existe retry administrativo implícito do backlog. Uma nova tentativa só
pode ser pedida por administrador autenticado, após confirmação explícita na
interface e para mensagem posterior a `ASSISTIVE_PROCESSING_NOT_BEFORE`. A
transação altera `failed` para `pending`, cria uma nova outbox contendo IDs e
grava auditoria. Cliques concorrentes não duplicam a solicitação.

Eventos da outbox já publicados são dados técnicos transitórios e podem ser
removidos após sete dias; estados pendentes, em processamento ou falhos não são
afetados. Atualizações idênticas da conexão Baileys não criam nova notificação.

## ADR-074 — Groq é alternativo explícito, não fallback silencioso

Em 03/08/2026, o proprietário autorizou o Groq a receber somente novas
mensagens e áudios posteriores a um novo corte temporal. Análise usa
`openai/gpt-oss-20b` com Structured Outputs estrito; transcrição usa
`whisper-large-v3-turbo`. Os dois preservam os mesmos limites, validação de
saída, idempotência, persistência original e revisão humana dos adapters OpenAI.

`AI_ADAPTER` e `TRANSCRIPTION_ADAPTER` selecionam um provedor por processo. Não
há tentativa automática em outro provedor após falha, pois isso enviaria dados
a um segundo destinatário sem uma decisão operacional visível. O endpoint
Responses do Groq não aceita `store` nem `include`; esses parâmetros são
omitidos apenas nessa composição, e a ausência de logprobs deixa confiança de
transcrição nula em vez de inventar um valor.

## ADR-075 — Identidade é determinística e o vínculo comercial é contextual e assistivo

A pessoa da conversa é resolvida antes da IA por workspace, conta WhatsApp,
JID canônico e telefone normalizado. O modelo nunca cria nem escolhe a
identidade técnica do remetente. A análise registra se aquele contato já
existia e diferencia mensagem recebida do contato de mensagem enviada pelo
usuário do workspace.

Para reconhecer continuação, devolutiva, novo assunto ou vários casos, o worker
consulta no PostgreSQL no máximo cinco negociações ativas e dez mensagens
anteriores do mesmo contato. O provedor recebe referências efêmeras `case_N`,
nunca UUIDs, telefone ou JID. Campos comerciais confirmados, resumos e textos
são truncados individualmente; candidatos além do limite tornam a revisão
humana obrigatória.

A restrição parcial que permitia somente uma negociação ativa por contato é
removida. Uma pessoa pode possuir casos comerciais simultâneos e independentes;
o vínculo inicial da mensagem é provisório quando houver mais de um candidato,
e a análise deixa essa ambiguidade visível em vez de escolher silenciosamente
um caso como verdade comercial.

O output versionado `message-context-v2` classifica `new_lead`, `new_case`,
`continuation`, `follow_up_response`, `multiple_cases` ou `unclear`, valida toda
referência contra os candidatos consultados e persiste o contexto junto à
análise. A associação inicial da mensagem continua transacional e nenhuma
negociação é criada, movida, mesclada ou reatribuída pela resposta do modelo.
Quando houver ambiguidade, a interface a apresenta para conferência explícita.
