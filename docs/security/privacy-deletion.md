# Exclusão de contato e dados associados

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

- exclusão integral do workspace ainda não possui fluxo administrativo;
- uma nova mensagem futura da mesma identidade do WhatsApp poderá criar outro contato; interrupção definitiva da coleta exige desconectar ou bloquear a origem;
- não há restauração: a confirmação deixa explícito que a ação é irreversível;
- outbox e auditoria preservam identificadores internos mínimos conforme a política operacional;
- o histórico de auditoria de contatos removidos ainda não possui uma tela global, embora permaneça consultável no banco.
