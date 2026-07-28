# Demonstração para o cliente

## Escopo

Esta demonstração apresenta o fluxo assistivo do noter.donadio em `https://leadcontrol.online`. Todos os contatos, telefones, mensagens, áudios e valores usados são fictícios. WhatsApp, transcrição e IA executam adapters locais; nenhuma conta real ou provedor pago participa da jornada.

O objetivo é validar a experiência comercial e colher decisões de produto. A demonstração não representa autorização para inserir dados reais.

## Preparação

Antes da reunião, acesse a VPS e confira o ambiente:

```bash
cd /opt/noter-donadio
git status --short --branch
scripts/status-vps.sh
```

Execute o smoke autenticado somente leitura:

```bash
read -rsp 'Senha da demonstração: ' demo_password
echo
ACCEPTANCE_WORKSPACE='demo-cliente' \
ACCEPTANCE_EMAIL='demo@example.com' \
ACCEPTANCE_PASSWORD="${demo_password}" \
node scripts/acceptance-vps.mjs
unset demo_password
```

Para preparar novamente o cenário fictício e repetir toda a homologação:

```bash
read -rsp 'Senha da demonstração: ' demo_password
echo
ACCEPTANCE_WORKSPACE='demo-cliente' \
ACCEPTANCE_EMAIL='demo@example.com' \
ACCEPTANCE_PASSWORD="${demo_password}" \
ACCEPTANCE_MUTATIONS=1 \
node scripts/acceptance-vps.mjs
unset demo_password
```

O modo mutável cria ou atualiza `Empresa Aurora — cenário fictício`, deixa sua negociação `Implantação CRM — homologação` em `proposal_sent` e acrescenta mensagens simuladas à caixa de conversas. Ele nunca apaga dados.

## Roteiro de 10 a 15 minutos

### 1. Contexto e dashboard

Entre com o workspace e o administrador de demonstração. Explique que:

- cada dado pertence explicitamente a um workspace;
- o dashboard usa agregações do PostgreSQL, não apenas os cartões carregados na tela;
- os valores e prazos exibidos são fictícios.

Mostre quantidade de contatos, negociações ativas, valor do pipeline e próximas ações.

### 2. Pipeline comercial

Abra o Pipeline e localize `Implantação CRM — homologação`, na etapa `Proposta enviada`.

Mostre:

- contato e produto de interesse;
- valor comercial e previsão de fechamento;
- próxima ação com prazo;
- movimentação do Kanban sempre iniciada pelo usuário.

Reforce que a IA sugere, mas não move a negociação automaticamente.

### 3. Detalhe e histórico

Abra a negociação de homologação. Mostre:

- dados confirmados manualmente;
- histórico de próxima ação concluída;
- trilha de mudanças de etapa;
- motivo obrigatório ao fechar uma negociação;
- reabertura preservada na auditoria.

### 4. Conversas e processamento

Abra Conversas e use a conexão simulada.

Demonstre uma mensagem de texto fictícia e, em seguida, um áudio fictício. Mostre que:

- a mensagem original aparece antes do processamento;
- reenvio com a mesma chave não duplica a mensagem;
- transcrição é artefato do áudio, não uma segunda mensagem;
- falha de IA ou transcrição não remove o conteúdo original;
- atualização em tempo real é reconciliada pela API.

### 5. IA assistiva

No detalhe da negociação criada pela conversa, apresente resumo, tags e próxima ação sugeridos.

Edite se necessário e aceite explicitamente uma sugestão. Destaque que dados confirmados manualmente têm precedência e que nenhuma mensagem é enviada automaticamente.

### 6. Administração

Abra Administração e mostre:

- sessões ativas e revogação;
- auditoria minimizada;
- exportação versionada do workspace;
- ausência de credenciais e chaves internas na exportação.

### 7. Encerramento

Peça ao cliente decisões sobre:

1. etapas e nomenclaturas do processo comercial;
2. campos obrigatórios de contato e negociação;
3. indicadores prioritários do dashboard;
4. regras para próxima ação e alertas;
5. formato desejado das sugestões de IA;
6. usuários, papéis e permissões necessários.

## Limitações que devem ser declaradas

- WhatsApp, IA e transcrição ainda são simulados.
- Não existe envio autônomo de mensagens.
- Banco, Redis, aplicação e backups locais compartilham a mesma VPS.
- Não há backup off-host nesta fase, por decisão aceita para dados fictícios.
- Mídia real e credenciais reais ainda não são permitidas.
- A integração planejada para dados reais é a WhatsApp Cloud API oficial e depende de autorização, credenciais e revisão de privacidade.

## Evidência esperada

Uma homologação completa termina com seis linhas `OK`, cobrindo:

- leituras autenticadas;
- criação e revogação de segunda sessão;
- jornada comercial;
- processamento fictício de conversa e áudio;
- exportação e auditoria;
- conclusão geral sem falhas.
