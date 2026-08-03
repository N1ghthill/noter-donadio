# Interface web do MVP

## Escopo implementado

A aplicação React é uma interface autenticada para o CRM e contém:

- login por workspace, e-mail e senha usando cookie de sessão `HttpOnly`;
- Home operacional com prioridades do dia e atalhos para as funções do CRM;
- visão geral agregada no servidor com contatos, negociações abertas, valor, conversão e pendências de acompanhamento;
- listagem e busca de contatos, com abertura direta da conversa ao selecionar o contato;
- cadastro manual de contato, com telefone, tags e observações;
- edição manual de nome, telefone, tags e observações do contato;
- pipeline Kanban com as sete etapas do domínio;
- criação manual de negociação vinculada a um contato, com valor decimal, etapa, produto e previsão de fechamento opcionais;
- definição de próxima ação e prazo na criação ou edição da negociação;
- movimentação de negociação por arrastar e soltar;
- movimentação alternativa por seletor de etapa, acessível via teclado;
- detalhe da negociação com contato, histórico, transcrições e sugestões estruturadas de IA;
- edição manual de título, valor, produto e previsão de fechamento com proteção contra conflito;
- confirmação explícita de uma seleção editável de etapa, tags, valor, produto, prazos e próxima ação sugeridos, ou registro de que a sugestão foi ignorada;
- sinalização no Kanban de próxima ação vencida, prevista para hoje, futura ou sem prazo;
- filtros de pipeline por busca, etapa e situação do acompanhamento;
- conclusão e histórico de próximas ações;
- motivo obrigatório ao fechar uma negociação como ganha ou perdida;
- histórico de auditoria com ator, instante, campos afetados, versões e transições de etapa;
- caixa de conversas em tabela clicável, com início, contagem, etapa,
  classificação da IA, resumo, filtros e histórico reconciliado via REST;
- agenda de próximas ações com filtros de prazo, classificação, resumo e
  conclusão explícita;
- criação e reagendamento rápido de follow-up a partir da conversa ou da
  agenda, com controle de versão;
- navegação contextual entre conversa, arquivos do contato, agenda e pipeline,
  preservando filtros relevantes na URL;
- biblioteca responsiva de áudios, imagens e documentos por contato, com busca,
  filtros combináveis, modos grade e lista, transcrição disponível para áudio e
  prévia ou download privado sob demanda;
- formulário local para simular recebimento idempotente de texto ou áudio sem enviar mensagens;
- exclusão irreversível de contato com confirmação explícita e remoção dos dados associados;
- indicador de conexão em tempo real e reconciliação REST automática;
- configuração simulada do WhatsApp com QR efêmero e estado persistido;
- administração de sessões ativas, resumo dos controles de privacidade e download da exportação do workspace;
- trilha global com as 50 ações auditáveis mais recentes do workspace;
- atualização otimista com reversão em erro e reconciliação em conflito de versão.

As telas tratam separadamente carregamento, falha e ausência de dados. Buscas
operacionais usam uma pequena espera após a digitação para reduzir recargas, e
os principais filtros podem ser preservados na URL. A interface não guarda
token no navegador e não executa ações autônomas de IA.

## Arquitetura do frontend

```text
src/
├── api/          cliente HTTP e normalização de erros
├── auth/         estado e bootstrap da sessão
├── components/   shell e estados reutilizáveis
├── lib/          rótulos e formatação local
├── pages/        Home, controle, agenda, arquivos, CRM, administração e WhatsApp
└── types/        representações das respostas REST
```

Durante o desenvolvimento, o Vite encaminha `/api` para `http://127.0.0.1:3000`. Isso mantém frontend e backend sob a mesma origem do ponto de vista do navegador e permite o uso seguro do cookie sem liberar CORS. Em produção, o proxy reverso deve servir a interface e encaminhar `/api` para o backend no mesmo site.

## Execução local

Partindo da raiz do repositório:

```bash
cp .env.example .env
set -a
source .env
set +a
docker compose -f compose.dev.yaml up -d
npm install
npm exec -w @noter/backend -- prisma migrate dev
npm run build -w @noter/backend
npm run bootstrap:admin -w @noter/backend
npm run seed:demo -w @noter/backend
```

Defina uma senha temporária de pelo menos 12 caracteres em `ADMIN_PASSWORD` apenas para o comando de bootstrap e remova-a do `.env` em seguida.

`seed:demo` é idempotente e cria somente dados fictícios: um contato, uma negociação, três mensagens, uma transcrição e uma análise assistiva. Ele permite validar todas as telas sem conectar WhatsApp ou chamar serviços pagos.

Inicie a API no primeiro terminal:

```bash
npm run start -w @noter/backend
```

Inicie a interface no segundo terminal:

```bash
npm run dev -w @noter/frontend
```

Para processar texto e áudio simulados de ponta a ponta, mantenha também `start:outbox`, `start:transcription`, `start:analysis`, `start:realtime` e `start:retention` ativos, conforme a documentação da API.

Abra o endereço informado pelo Vite, normalmente `http://localhost:5173`, e use o workspace e administrador criados no bootstrap.

## Validação

```bash
npm run typecheck
npm test
npm run build
```

Os testes do frontend cobrem cookie de sessão, busca, erros HTTP, controle otimista de versão, criação e acompanhamento de negociações, decisões assistivas, exportação administrativa, caixa de conversas, simulação de entrada e formatação. Testes integrados com PostgreSQL e Redis requerem os serviços locais ativos.

## Limites conhecidos desta fatia

- notificações em tempo real cobrem edição e exclusão de contato, criação e atualização de negociação, mudança de etapa, decisão assistiva, conexão, persistência de mensagem, transcrição e análise;
- adapters falsos de análise e transcrição ficam restritos ao profile `demo`;
  no ambiente Baileys, a interface informa explicitamente quando esses recursos
  ainda não estão ativados;
- etapa, tags, valor, produto, previsões e próxima ação só são aplicados após confirmação explícita e auditada;
- objeções e as demais próximas ações sugeridas continuam informativas e não executam ações autônomas;
- o ambiente publicado usa exclusivamente o adapter Baileys; a simulação fica
  restrita ao profile local `demo`, e o novo pareamento depende de ação
  explícita quando o número estiver disponível;
- upload manual, pastas e compartilhamento externo de arquivos ainda não
  pertencem ao MVP;
- áudio Baileys pode ser carregado sob demanda por URL curta, assinada e
  autenticada após o download privado na VPS;
- a exportação JSON é gerada de forma síncrona e deverá virar uma tarefa assíncrona antes de workspaces grandes;
- exclusão integral de workspace permanece bloqueada até a aprovação da política de retenção, backups e prazo de cancelamento; a auditoria global ainda não possui paginação além dos 50 eventos recentes.
