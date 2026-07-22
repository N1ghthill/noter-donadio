# Exportação e exclusão de dados

## Exportação do workspace

Um administrador autenticado pode baixar na área de administração um JSON `workspace-export-v1`. Workspace e usuário são derivados da sessão, a resposta não pode ser armazenada em cache e o nome do arquivo é sanitizado. A geração é limitada a uma por minuto por origem no processo atual.

O documento reúne usuários sem credenciais, contas do WhatsApp sem chaves, contatos, negociações, acompanhamentos, mensagens, metadados de mídia, transcrições, análises, decisões e auditoria. Ele não inclui hashes de senha ou sessão, chaves de autenticação do WhatsApp, chaves físicas de mídia, leases, outbox ou tarefas internas. O acesso é registrado como `workspace_exported` na mesma transação de snapshot da leitura.

O arquivo contém dados pessoais em texto legível. Deve ser armazenado em local privado, transmitido por canal seguro e removido quando deixar de ser necessário. A geração síncrona atual deverá se tornar assíncrona e paginada antes de workspaces grandes.

## Comportamento implementado

Um administrador autenticado pode excluir um contato na tela de contatos. A interface exibe uma confirmação explícita e envia `DELETE /api/contacts/:id` com o mesmo UUID no corpo. O servidor ignora qualquer identidade externa: usuário e workspace vêm exclusivamente da sessão.

Na mesma transação PostgreSQL, o backend:

1. bloqueia o contato no workspace para impedir nova mensagem concorrente;
2. registra tarefas duráveis para todas as chaves de mídia associadas;
3. cria auditoria minimizada `contact_deleted` sem copiar nome, telefone, mensagens ou transcrições;
4. cria `contact.deleted` na outbox contendo somente IDs;
5. exclui o contato e, por cascata, negociações, mensagens, mídias, análises e decisões associadas.

Depois do commit, o arquivo privado deixa de ser acessível pela API porque seu registro de mídia já não existe. A aplicação tenta removê-lo imediatamente do armazenamento e conclui a tarefa durável. Se o filesystem estiver indisponível, a tarefa permanece no PostgreSQL e `start:retention` tenta novamente a cada ciclo. A exclusão do arquivo ausente é considerada sucesso, tornando o fluxo idempotente.

Auditorias anteriores perdem as referências ao contato e às negociações por `ON DELETE SET NULL`, mas preservam ator, ação e instante. O evento da exclusão guarda somente a quantidade de mídias associadas. Repetir a requisição depois do sucesso retorna `204` sem criar outra auditoria.

## Proteção da ação

- somente sessão administrativa ativa pode executar a rota;
- o UUID de confirmação deve ser exatamente igual ao parâmetro da rota;
- uma tentativa para outro workspace não revela se o contato existe;
- a validação global de `Origin` também se aplica ao `DELETE`;
- não há exclusão automática disparada por IA, WhatsApp ou worker.

## Limites atuais

- exclusão integral do workspace não é exposta na interface nem na API; sua política ainda precisa resolver mídias externas, auditoria mínima, backups e período de arrependimento;
- uma nova mensagem futura da mesma identidade do WhatsApp poderá criar outro contato; interrupção definitiva da coleta exige desconectar ou bloquear a origem;
- não há restauração: a confirmação deixa explícito que a ação é irreversível;
- outbox e auditoria preservam identificadores internos mínimos conforme a política operacional;
- a área administrativa mostra os 50 eventos de auditoria mais recentes, inclusive os ligados a contatos já removidos; paginação e retenção ainda precisam ser definidas para grandes volumes.

O protocolo proposto para exclusão integral está em [`workspace-deletion.md`](workspace-deletion.md). Ele não autoriza nem implementa a ação destrutiva.
