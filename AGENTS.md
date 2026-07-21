# AGENTS.md — noter.donadio

Este arquivo é o contrato operacional para qualquer pessoa ou agente de IA que trabalhe neste repositório. Ele se aplica a toda a árvore do projeto. Um `AGENTS.md` mais próximo de um arquivo pode acrescentar regras locais, mas não pode enfraquecer segurança, privacidade ou integridade de dados definidas aqui.

## 1. Objetivo do produto

O noter.donadio transforma conversas do WhatsApp em contatos e oportunidades comerciais organizadas. O sistema recebe eventos, preserva a mensagem original, processa texto e áudio de forma assíncrona, produz sugestões com IA e atualiza uma interface de CRM em tempo real.

O MVP é assistivo:

- a IA extrai e sugere; ela não envia mensagens sozinha;
- alterações irreversíveis ou comerciais relevantes exigem ação explícita do usuário;
- toda mensagem aceita pelo sistema deve ser persistida antes de qualquer processamento externo;
- falhas de IA ou transcrição nunca podem apagar ou impedir a consulta da mensagem original.

## 2. Fontes de verdade

Consulte nesta ordem:

1. testes automatizados e contratos tipados do código;
2. decisões em `docs/architecture/decisions.md`;
3. escopo em `docs/product/mvp.md`;
4. este `AGENTS.md`;
5. o relatório original `projeto_tecnico_noter_donadio_FINAL_PDF.md` e seus diagramas.

O relatório original é uma referência de produto, não uma especificação executável. Quando houver conflito, não copie a inconsistência: registre a decisão em `docs/architecture/decisions.md` e ajuste código e testes juntos.

## 3. Forma de trabalho assistida por IA

Antes de alterar código:

1. leia este arquivo e qualquer `AGENTS.md` aplicável ao diretório;
2. inspecione os arquivos relacionados e o estado do repositório;
3. declare suposições relevantes;
4. para mudanças com mais de uma unidade lógica, mantenha um plano curto e verificável;
5. preserve alterações existentes que não pertençam à tarefa.

Ao implementar:

- faça mudanças pequenas, coesas e fáceis de revisar;
- não introduza abstrações sem um consumidor real;
- prefira contratos explícitos e funções puras no domínio;
- atualize testes na mesma mudança;
- execute apenas os testes proporcionais ao risco e informe exatamente o que foi validado;
- não declare uma tarefa concluída com testes falhando ou sem mencionar validações não executadas;
- não atualize o PDF gerado manualmente;
- registre decisões duradouras na documentação, não apenas em comentários ou conversas.

Ao revisar trabalho gerado por IA, procure especialmente por:

- APIs ou versões inventadas;
- caminhos felizes sem idempotência ou tratamento de retry;
- vazamento de mensagens, telefones, tokens ou áudios em logs;
- operações de banco não atômicas;
- confiança indevida em respostas do LLM;
- mudanças silenciosas de regra de negócio.

## 4. Arquitetura obrigatória do MVP

O backend é um monólito modular com processos separados para API, ingestão do WhatsApp e workers. Os módulos compartilham contratos e banco, mas não acessam internals uns dos outros.

Fluxo mínimo de uma mensagem:

1. receber evento do provedor do WhatsApp;
2. normalizar identidade, direção, tipo e conteúdo;
3. aplicar filtros do MVP e deduplicação;
4. em transação, criar/resolver contato e negociação, persistir a mensagem e criar um evento de saída;
5. após o commit, publicar o job no BullMQ;
6. processar IA ou transcrição de modo idempotente;
7. persistir o resultado sem sobrescrever valores confirmados manualmente;
8. emitir atualização em tempo real.

Regras estruturais:

- PostgreSQL é a fonte de verdade; Redis não pode ser a única cópia de dados de negócio.
- Jobs BullMQ transportam IDs, não conteúdo completo de conversas, salvo necessidade técnica documentada.
- Cada worker deve tolerar entrega repetida.
- Eventos em tempo real são notificações; o frontend sempre consegue reconciliar estado via API REST.
- Integrações externas ficam atrás de adapters testáveis.
- O código de domínio não importa SDKs do WhatsApp, OpenAI, Redis ou Fastify.

## 5. Invariantes de domínio

### Contatos

- Todo dado pertence a um `workspaceId`, inclusive no MVP de cliente único.
- `jid` é opcional para contato manual e único dentro do workspace quando presente.
- Telefone deve ser normalizado antes de comparação, mas não substitui a identidade técnica do WhatsApp.
- Não criar contatos automaticamente para grupos, status, newsletters ou eventos de protocolo no MVP.
- Mesclagem deve preservar mensagens, negociações e trilha de auditoria.

### Negociações

- Use `stage`, não um `status` ambíguo, para o Kanban: `lead`, `qualified`, `proposal_sent`, `in_negotiation`, `closed_won`, `closed_lost`, `on_hold`.
- Uma negociação ativa é aquela cujo `stage` não é `closed_won` nem `closed_lost`.
- A IA pode sugerir estágio, valor, tags e próxima ação. No MVP, não deve mover estágio automaticamente.
- Valores confirmados manualmente têm precedência sobre extrações posteriores da IA.

### Mensagens e áudio

- A chave de idempotência inclui workspace/conta do WhatsApp e ID externo da mensagem.
- Mensagens recebidas e enviadas pelo usuário devem ter direção correta e ser preservadas.
- A mensagem de áudio e seu registro de mídia com estado `pending` existem antes do job de transcrição.
- A transcrição é um artefato da mensagem de áudio, não uma segunda mensagem recebida. Uma visão textual pode ser fornecida ao worker de IA sem duplicar a conversa.
- Estados de processamento devem ser explícitos: `pending`, `processing`, `completed`, `failed`.

### IA

- Saídas do modelo são dados não confiáveis: validar com schema estrito antes de persistir.
- Prompts possuem versão registrada junto à análise.
- Nunca enviar mais histórico ao provedor do que o necessário para a tarefa.
- Não inventar valor, prazo ou produto ausente; campos desconhecidos permanecem nulos.
- Análises guardam modelo, versão do prompt, tokens, duração e confiança quando disponíveis.

## 6. Segurança e privacidade

- Nunca commitar `.env`, credenciais Baileys, tokens, dumps, mensagens reais ou áudios reais.
- Nunca registrar conteúdo de mensagem, transcrição, telefone completo, QR code ou dados de autenticação.
- Mascarar identificadores nos logs e usar IDs internos para correlação.
- Credenciais do WhatsApp devem ser criptografadas em repouso com criptografia autenticada e chave fora do banco.
- Endpoints de setup, mídia, filas e health detalhado exigem autenticação e autorização.
- URLs de mídia devem ser curtas, assinadas e vinculadas ao workspace.
- Toda tabela de negócio deve permitir retenção e exclusão conforme política de privacidade.
- Dados reais não são permitidos em fixtures, snapshots ou prompts de teste.

## 7. Convenções de código

- TypeScript em modo `strict`; evite `any`, assertions não justificadas e enums numéricos.
- Nomes de código em inglês; textos de interface e documentação do produto em português do Brasil.
- Datas trafegam em ISO 8601 UTC; formatação local ocorre apenas na interface.
- Dinheiro usa decimal no banco e representação segura no domínio; nunca ponto flutuante para cálculo financeiro.
- Validação existe nas fronteiras: HTTP, WebSocket, filas, banco e respostas externas.
- Erros devem ser tipados e não revelar dados sensíveis ao cliente.
- Não use `console.log` em código de aplicação; use logger estruturado com redaction.

## 8. Testes e critérios de conclusão

Pirâmide mínima:

- unitários para regras de domínio e normalização;
- integração para repositórios, transações, filas e adapters;
- contratos para payloads HTTP, jobs e respostas de IA;
- ponta a ponta para os fluxos críticos, usando serviços falsos onde houver integração paga ou conta real.

Toda alteração deve manter:

- lint e typecheck sem erros;
- testes relacionados passando;
- migrations testadas em banco vazio e, quando aplicável, em upgrade;
- documentação atualizada quando contrato ou regra de negócio mudar.

Não use uma conta real do WhatsApp nem faça chamadas pagas em testes automatizados.

## 9. Git e documentação

- Commits devem representar uma intenção única e usar mensagens claras.
- Não reescreva histórico ou descarte alterações de terceiros sem autorização.
- Migrations já compartilhadas não são editadas; crie uma nova migration.
- Diagramas devem refletir o comportamento implementado, não planos indefinidos.
- Débitos aceitos devem ter justificativa, impacto e condição de remoção documentados.

## 10. Ações proibidas sem autorização explícita

- enviar mensagens pelo WhatsApp;
- conectar ou desconectar uma sessão real;
- apagar contatos, conversas, mídias ou negociações reais;
- executar migrations destrutivas em ambiente compartilhado;
- publicar imagens, pacotes, releases ou deploys;
- adicionar um provedor externo que receba dados de conversas.
