# Visões operacionais do CRM

Esta fase organiza o trabalho diário sem depender de uma sessão WhatsApp ativa
ou de um provedor de IA configurado.

## Home

A Home é o ponto de entrada do operador. Ela apresenta prioridades do dia e
atalhos para contatos, pipeline, agenda, arquivos, conversas, WhatsApp e
controle. Os indicadores são calculados no servidor ou derivados das consultas
autenticadas; nenhum número comercial fica fixo no frontend.

## Central de controle

A rota `/controle` mantém o painel agregado por período, com contatos,
negociações abertas, valor do pipeline, conversão, tarefas vencidas e previstas
para hoje. O relatório de entrada e resultado acrescenta novos contatos, novas
negociações, valor ganho e ticket médio ganho na mesma janela. Essa tela serve
à supervisão; a Home serve à execução diária. Indicadores, etapas e registros
recentes são atalhos para as respectivas visões de contatos, pipeline ou agenda,
já com o filtro correspondente aplicado quando houver.

## Pendências e piloto

A navegação autenticada resume ações vencidas, ações para hoje e negociações
sem próxima ação. A central não cria uma segunda cópia das tarefas: ela deriva
os números do mesmo dashboard e leva aos filtros correspondentes da Agenda.
Se a leitura falhar, a interface mostra indisponibilidade em vez de zero.

A rota `/piloto` apresenta seis jornadas guiadas de homologação. As marcações
ficam no `localStorage` do navegador, não são evidência de auditoria e não
alteram contatos, negociações, mensagens ou a sessão WhatsApp. O roteiro pode
ser impresso e reiniciado mediante confirmação.

## Conversas

A rota `/conversas` oferece uma tabela operacional clicável, com filtros de:

- período de atividade: hoje, 7 dias, 30 dias ou todo o histórico;
- etapa atual confirmada;
- classificação sugerida pela IA;
- contato ou título da negociação.

Cada linha representa uma pessoa pelo telefone normalizado, mesmo quando o
Baileys já registrou JID telefônico e LID distintos ou existem várias
negociações para o contato. “Iniciada” significa a primeira mensagem persistida
desse histórico conversacional, mas o filtro considera qualquer mensagem dentro
do período selecionado. O intervalo de hoje respeita o dia local do navegador e
é enviado à API como limites UTC. Ao selecionar uma linha, todas as
mensagens e mídias da pessoa são reconciliadas pela API REST; o atalho comercial
continua apontando para a negociação da atividade mais recente.
Os filtros e a conversa selecionada permanecem na URL, permitindo voltar ao
mesmo contexto. A busca aguarda uma breve pausa na digitação para evitar
requisições a cada tecla.

A coluna “Classificação IA” mostra a etapa sugerida pela análise concluída mais
recente. Ela não representa uma mudança automática do Kanban. Sem análise
concluída, a tela mostra “Não classificada”. O resumo segue a mesma origem e
nunca é inventado.

No detalhe, o operador pode criar ou reagendar a próxima ação sem abandonar a
conversa. A gravação usa a versão atual da negociação e recusa sobrescrita
quando outra sessão alterou os dados. Atalhos levam ao catálogo de arquivos do
contato, à agenda filtrada e ao detalhe completo no pipeline.

## Agenda

A rota `/agenda` usa a próxima ação da negociação como tarefa ativa. Ela
permite filtrar tarefas vencidas, de hoje, futuras ou sem prazo, buscar por
contato/título e concluir uma ação com confirmação explícita e controle
otimista de versão.

A tabela mostra tarefa, contato, prazo, etapa atual, classificação sugerida
pela IA e o último resumo disponível. Concluir arquiva a ação no histórico da
negociação; não apaga o acompanhamento já realizado.

Cada linha também permite definir ou reagendar o follow-up no próprio contexto,
com links separados para conversa e negociação. Filtros e busca são
compartilháveis pela URL e a busca não dispara uma consulta a cada tecla.

## Arquivos por contato

A rota `/arquivos` organiza áudios, imagens e documentos enviados ou recebidos.
Ela permite buscar por nome do arquivo, contato ou legenda e combinar filtros
de tipo, contato, direção e período. Imagens usam prévia sob demanda; áudios
usam o player; documentos exigem preparação explícita do download. Todos
solicitam acesso curto e assinado somente quando necessário. Chaves físicas de
armazenamento não chegam ao navegador.

O catálogo usa cartões responsivos, estados vazios orientativos, ação para
limpar filtros, resumo dos filtros ativos, modos grade e lista, URL
compartilhável e acessos separados à conversa e à negociação. Áudios concluídos
exibem também a transcrição persistida, sem substituir o arquivo original. Um
atalho vindo da conversa abre a biblioteca já filtrada pelo contato; selecionar
o nome do contato abre exatamente a conversa associada. Upload manual, pastas e
compartilhamento externo não fazem parte desta fatia.

Contatos, pipeline, conversas e arquivos carregam páginas adicionais sob
demanda. O histórico começa pelas mensagens mais recentes e permite buscar
páginas anteriores sem repetir itens. A data de retenção fica visível e o
usuário pode renovar uma URL assinada expirada enquanto o arquivo ainda existe.

Contatos com o mesmo telefone podem ser consolidados após escolher
explicitamente qual registro será mantido. A operação preserva mensagens e
negociações e fica auditada; duas negociações ativas precisam ser resolvidas
manualmente antes da consolidação.

Na listagem de contatos, selecionar o nome abre a caixa de conversas filtrada
pelo identificador interno do contato. A URL preserva esse contexto sem depender
de nomes ou telefones semelhantes.

## Saúde e recuperação

A Administração resume a operação em três sinais voltados ao cliente:
WhatsApp, inteligência artificial e notificações. O estado geral só aparece
como saudável quando a sessão está conectada, transcrição e análise estão
ativas sem falha aguardando revisão e o canal de alertas está habilitado sem
entrega falha. O painel usa consultas autenticadas já existentes e não expõe
tokens, conteúdo de conversas ou detalhes da infraestrutura.

A rota `/whatsapp` mantém o QR oculto enquanto a sessão está saudável e oferece
um plano de recuperação orientado. A remoção da autenticação anterior só fica
disponível para uma conta desconectada, exige confirmação explícita e preserva
contatos, negociações, mensagens e arquivos. Depois da liberação, o novo QR deve
ser lido somente no telefone oficial da empresa. O servidor continua recusando
o reset quando detecta uma sessão conectada.

## Estados sem integrações externas

As telas continuam funcionais com WhatsApp desconectado. Novas conversas só
aparecerão quando houver ingestão real novamente, mas contatos, negociações,
tarefas, histórico e arquivos persistidos permanecem consultáveis.

Com IA desligada, classificações e resumos históricos continuam visíveis.
Novas mensagens ficam sem classificação até a ativação explícita do adapter e
do respectivo worker.
