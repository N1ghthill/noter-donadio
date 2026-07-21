# Interface web do MVP

## Escopo implementado

A aplicação React é uma interface autenticada para o CRM e contém:

- login por workspace, e-mail e senha usando cookie de sessão `HttpOnly`;
- visão geral com totais de contatos, negociações abertas e valor do pipeline;
- listagem e busca de contatos;
- cadastro manual de contato, com telefone, tags e observações;
- edição manual de nome, telefone, tags e observações do contato;
- pipeline Kanban com as sete etapas do domínio;
- movimentação de negociação por arrastar e soltar;
- movimentação alternativa por seletor de etapa, acessível via teclado;
- detalhe da negociação com contato, histórico, transcrições e sugestões estruturadas de IA;
- edição e confirmação explícita de etapa/tags sugeridas, ou registro de que a sugestão foi ignorada;
- histórico de auditoria com ator, instante, campos afetados, versões e transições de etapa;
- caixa de conversas ordenada pela mensagem mais recente, com histórico reconciliado via REST;
- formulário local para simular recebimento idempotente de texto ou áudio sem enviar mensagens;
- exclusão irreversível de contato com confirmação explícita e remoção dos dados associados;
- indicador de conexão em tempo real e reconciliação REST automática;
- configuração simulada do WhatsApp com QR efêmero e estado persistido;
- atualização otimista com reversão em erro e reconciliação em conflito de versão.

As telas tratam separadamente carregamento, falha e ausência de dados. A interface não guarda token no navegador e não executa ações autônomas de IA.

## Arquitetura do frontend

```text
src/
├── api/          cliente HTTP e normalização de erros
├── auth/         estado e bootstrap da sessão
├── components/   shell e estados reutilizáveis
├── lib/          rótulos e formatação local
├── pages/        dashboard, contatos, conversas, login, pipeline e WhatsApp
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

Os testes do frontend cobrem o envio do cookie, codificação de busca, erros HTTP, controle otimista de versão, caixa de conversas, simulação de entrada e formatação da interface. Testes integrados com PostgreSQL e Redis requerem os serviços locais ativos.

## Limites conhecidos desta fatia

- o MVP ainda não cria negociações pela interface; elas surgem pelo fluxo de ingestão;
- notificações em tempo real cobrem edição de contato, mudança de etapa, conexão, persistência de mensagem, transcrição e análise;
- a análise usa apenas o adapter falso; etapa e tags só são aplicadas após confirmação explícita e auditada;
- valor, produto, prazo, objeções e próximas ações ainda são apenas informativos e não possuem ação de aplicação;
- a conexão atual é simulada; nenhum adapter real de WhatsApp está habilitado;
- áudio fictício pode ser carregado sob demanda por URL curta, assinada e autenticada; download real do WhatsApp e armazenamento de produção ainda não estão conectados;
- exclusão integral de workspace e uma tela global para auditorias de contatos removidos ainda não estão disponíveis.
