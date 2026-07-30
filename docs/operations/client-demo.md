# Demonstração para o cliente

## Escopo

Esta demonstração apresenta o CRM do noter.donadio em
`https://leadcontrol.online`. A VPS usa uma conta Baileys controlada e pode
conter mensagens enviadas pelo próprio responsável para homologação. Não use
dados de clientes. Transcrição e análise novas permanecem desligadas enquanto a
chave OpenAI não for configurada.

O objetivo é validar a experiência comercial e colher decisões de produto. A demonstração não representa autorização para inserir dados reais.

Para conduzir uma rodada formal, use também o
[`pilot.md`](pilot.md) e a tela autenticada `/piloto`.

## Preparação

Antes da reunião, acesse a VPS e confira o ambiente:

```bash
cd /opt/noter-donadio
git status --short --branch
sudo scripts/status-vps.sh
```

Em um checkout de desenvolvimento com Node 24, execute o smoke autenticado somente leitura:

```bash
scripts/run-acceptance-vps.sh
```

O modo mutável abaixo é exclusivo do profile local `demo`; não funciona nem
deve ser habilitado na VPS Baileys:

```bash
scripts/run-acceptance-vps.sh --mutations
```

No ambiente local, ele cria ou atualiza `Empresa Aurora — cenário fictício`,
deixa sua negociação `Implantação CRM — homologação` em `proposal_sent` e
acrescenta mensagens simuladas à caixa de conversas. Ele nunca apaga dados.

O wrapper solicita a senha sem exibi-la e usa Node 24 quando disponível. O usuário restrito da VPS não executa containers arbitrários; por isso, a homologação automatizada é disparada pelo checkout de desenvolvimento contra o domínio público.

## Roteiro de 10 a 15 minutos

### 1. Contexto e dashboard

Entre com o workspace e o administrador de demonstração. Explique que:

- cada dado pertence explicitamente a um workspace;
- o dashboard usa agregações do PostgreSQL, não apenas os cartões carregados na tela;
- os valores e prazos exibidos são fictícios.

Mostre quantidade de contatos, negociações ativas, valor do pipeline, próximas
ações, entrada de contatos e negociações, valor ganho e ticket médio no
período.

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

### 4. Conversas e mídia

Abra Conversas e apresente as mensagens controladas já persistidas.

Mostre que:

- a mensagem original aparece antes do processamento;
- a deduplicação é validada por testes e pelo ID externo do WhatsApp;
- transcrição é artefato do áudio, não uma segunda mensagem;
- falha de IA ou transcrição não remove o conteúdo original;
- atualização em tempo real é reconciliada pela API.

Se o responsável decidir enviar nova mensagem durante a reunião, ele próprio
deve fazê-lo pelo WhatsApp conectado. O noter.donadio não possui endpoint de
envio e não executa resposta automática.

### 5. IA assistiva preparada

Apresente uma análise sintética histórica apenas se ela estiver identificada
como demonstração. Explique que o contrato de sugestão, edição e aceite está
implementado, mas novas chamadas OpenAI estão desligadas.

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

- O roteiro histórico da tag `v0.2.0-mvp` usa WhatsApp, IA e transcrição
  simulados. Na VPS atual, WhatsApp e download de áudio são reais; IA e
  transcrição novas permanecem desativadas.
- Não existe envio autônomo de mensagens.
- Banco, Redis, aplicação e backups locais compartilham a mesma VPS.
- Não há backup off-host nesta fase, por decisão aceita para dados fictícios.
- Banco, mídia e credenciais Baileys reais estão restritos à VPS controlada;
  não fazem parte do roteiro histórico de demonstração.

## Evidência esperada

Uma homologação completa termina com seis linhas `OK`, cobrindo:

- leituras autenticadas;
- criação e revogação de segunda sessão;
- jornada comercial;
- processamento fictício de conversa e áudio;
- exportação e auditoria;
- conclusão geral sem falhas.
