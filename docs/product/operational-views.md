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
para hoje. Essa tela serve à supervisão; a Home serve à execução diária.

## Conversas

A rota `/conversas` oferece uma tabela operacional clicável, com filtros de:

- período de início: hoje, 7 dias, 30 dias ou todo o histórico;
- etapa atual confirmada;
- classificação sugerida pela IA;
- contato ou título da negociação.

Cada linha representa uma pessoa pelo telefone normalizado, mesmo quando o
Baileys já registrou JID telefônico e LID distintos ou existem várias
negociações para o contato. “Iniciada” significa a primeira mensagem persistida
desse histórico conversacional. O intervalo de hoje respeita o dia local do
navegador e é enviado à API como limites UTC. Ao selecionar uma linha, todas as
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
limpar filtros, URL compartilhável e acessos separados à conversa e à
negociação. Um atalho vindo da conversa abre a biblioteca já filtrada pelo
contato. Upload manual, pastas e compartilhamento externo não fazem parte
desta fatia.

Contatos, pipeline, conversas e arquivos carregam páginas adicionais sob
demanda. O histórico começa pelas mensagens mais recentes e permite buscar
páginas anteriores sem repetir itens. A data de retenção fica visível e o
usuário pode renovar uma URL assinada expirada enquanto o arquivo ainda existe.

Contatos com o mesmo telefone podem ser consolidados após escolher
explicitamente qual registro será mantido. A operação preserva mensagens e
negociações e fica auditada; duas negociações ativas precisam ser resolvidas
manualmente antes da consolidação.

## Estados sem integrações externas

As telas continuam funcionais com WhatsApp desconectado. Novas conversas só
aparecerão quando houver ingestão real novamente, mas contatos, negociações,
tarefas, histórico e arquivos persistidos permanecem consultáveis.

Com IA desligada, classificações e resumos históricos continuam visíveis.
Novas mensagens ficam sem classificação até a ativação explícita do adapter e
do respectivo worker.
