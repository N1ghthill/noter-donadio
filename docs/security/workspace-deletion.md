# Protocolo proposto para exclusão integral do workspace

Status: desenho de segurança; não implementado e não autorizado para execução.

## Por que não existe um botão ainda

O workspace é a raiz de contatos, negociações, mensagens, mídias, análises, usuários, sessões e auditorias. Uma cascata direta apagaria o banco, mas não garantiria remoção de objetos externos, jobs já publicados ou cópias de backup. A ação também encerraria a sessão usada para acompanhar sua própria conclusão.

## Fluxo em duas fases

### 1. Solicitação e contenção

1. exigir administrador autenticado, reautenticação recente e confirmação do slug do workspace;
2. criar uma solicitação durável e idempotente, sem apagar dados;
3. bloquear nova ingestão, setup, mutações comerciais e criação de sessões;
4. revogar integrações e impedir novos jobs do workspace;
5. oferecer exportação e registrar o checksum do arquivo entregue, sem guardar sua cópia em área pública;
6. iniciar um prazo de cancelamento aprovado pela política do produto.

### 2. Execução

1. confirmar que não existem jobs em processamento e impedir nova publicação pela outbox;
2. criar tarefas duráveis para todas as mídias e credenciais externas;
3. remover objetos privados e credenciais antes de apagar suas referências;
4. apagar o agregado do workspace em transação controlada;
5. manter fora do agregado apenas um comprovante mínimo da solicitação e conclusão, sem identificadores pessoais;
6. registrar a exclusão em um ledger operacional protegido, para que uma restauração de backup não reative o workspace apagado;
7. revogar todas as sessões e confirmar a conclusão por canal previamente verificado.

## Backup e restauração

Backups imutáveis normalmente não permitem remoção seletiva imediata. A política deve definir prazo máximo de expiração e impedir uso operacional de uma cópia restaurada antes de reaplicar o ledger de exclusões. Dumps fora da retenção devem ser destruídos de forma verificável.

## Decisões obrigatórias antes da implementação

- duração do prazo de cancelamento e exceções legais;
- prazo de retenção de auditoria e do comprovante mínimo;
- mecanismo de reautenticação e canal de confirmação;
- comportamento de cobrança e contratos ativos;
- armazenamento do ledger fora do workspace;
- semântica de falha parcial para mídia, provedor e backup;
- responsável autorizado a cancelar ou aprovar a execução.

Somente após essas decisões o schema deve receber estados explícitos como `requested`, `cooling_off`, `executing`, `completed`, `cancelled` e `failed`. A implementação deve usar worker idempotente e testes com dados exclusivamente fictícios.
