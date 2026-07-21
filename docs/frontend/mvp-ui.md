# Interface web do MVP

## Escopo implementado

A aplicação React é uma interface autenticada para o CRM e contém:

- login por workspace, e-mail e senha usando cookie de sessão `HttpOnly`;
- visão geral com totais de contatos, negociações abertas e valor do pipeline;
- listagem e busca de contatos;
- cadastro manual de contato, com telefone, tags e observações;
- pipeline Kanban com as sete etapas do domínio;
- movimentação de negociação por arrastar e soltar;
- atualização otimista com reversão em erro e reconciliação em conflito de versão.

As telas tratam separadamente carregamento, falha e ausência de dados. A interface não guarda token no navegador e não executa ações autônomas de IA.

## Arquitetura do frontend

```text
src/
├── api/          cliente HTTP e normalização de erros
├── auth/         estado e bootstrap da sessão
├── components/   shell e estados reutilizáveis
├── lib/          rótulos e formatação local
├── pages/        dashboard, contatos, login e pipeline
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
```

Defina uma senha temporária de pelo menos 12 caracteres em `ADMIN_PASSWORD` apenas para o comando de bootstrap e remova-a do `.env` em seguida.

Inicie a API no primeiro terminal:

```bash
npm run start -w @noter/backend
```

Inicie a interface no segundo terminal:

```bash
npm run dev -w @noter/frontend
```

Abra o endereço informado pelo Vite, normalmente `http://localhost:5173`, e use o workspace e administrador criados no bootstrap.

## Validação

```bash
npm run typecheck
npm test
npm run build
```

Os testes do frontend cobrem o envio do cookie, codificação de busca, erros HTTP, controle otimista de versão e formatação da interface. Testes integrados com PostgreSQL e Redis requerem os serviços locais ativos.

## Limites conhecidos desta fatia

- o MVP ainda não cria negociações pela interface; elas surgem pelo fluxo de ingestão;
- atualizações em tempo real ainda serão conectadas, portanto a tela reconcilia dados ao abrir e após conflito;
- arrastar e soltar atende ponteiro/mouse; um seletor explícito de etapa deve ser adicionado para equivalência completa via teclado;
- a política de proteção CSRF para exposição pública ainda depende da validação de `Origin` prevista na documentação de autenticação.
