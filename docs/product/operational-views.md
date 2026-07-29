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

“Iniciada” significa a primeira mensagem persistida da negociação. O intervalo
de hoje respeita o dia local do navegador e é enviado à API como limites UTC.
Ao selecionar uma linha, o histórico completo é reconciliado pela API REST.

A coluna “Classificação IA” mostra a etapa sugerida pela análise concluída mais
recente. Ela não representa uma mudança automática do Kanban. Sem análise
concluída, a tela mostra “Não classificada”. O resumo segue a mesma origem e
nunca é inventado.

## Agenda

A rota `/agenda` usa a próxima ação da negociação como tarefa ativa. Ela
permite filtrar tarefas vencidas, de hoje, futuras ou sem prazo, buscar por
contato/título e concluir uma ação com confirmação explícita e controle
otimista de versão.

A tabela mostra tarefa, contato, prazo, etapa atual, classificação sugerida
pela IA e o último resumo disponível. Concluir arquiva a ação no histórico da
negociação; não apaga o acompanhamento já realizado.

## Arquivos por contato

A rota `/arquivos` organiza áudios, imagens e documentos enviados ou recebidos.
Ela permite buscar por nome do arquivo, contato ou legenda e combinar filtros
de tipo, contato, direção e período. Imagens usam prévia sob demanda; áudios
usam o player; documentos exigem preparação explícita do download. Todos
solicitam acesso curto e assinado somente quando necessário. Chaves físicas de
armazenamento não chegam ao navegador.

O catálogo usa cartões responsivos, estados vazios orientativos, ação para
limpar filtros e acesso direto à conversa e negociação. Upload manual, pastas e
compartilhamento externo não fazem parte desta fatia.

## Estados sem integrações externas

As telas continuam funcionais com WhatsApp desconectado. Novas conversas só
aparecerão quando houver ingestão real novamente, mas contatos, negociações,
tarefas, histórico e arquivos persistidos permanecem consultáveis.

Com IA desligada, classificações e resumos históricos continuam visíveis.
Novas mensagens ficam sem classificação até a ativação explícita do adapter e
do respectivo worker.
