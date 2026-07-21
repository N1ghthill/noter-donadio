# Autenticação e sessões

## Decisão

O MVP usa sessão opaca e revogável no PostgreSQL. O navegador recebe apenas um valor aleatório de 256 bits em cookie `HttpOnly`, `SameSite=Strict`, `Path=/` e `Secure` em produção. O banco guarda somente o SHA-256 do token.

Não usamos JWT nem armazenamos credenciais em `localStorage` ou `sessionStorage`. Essa decisão segue a recomendação da OWASP de manter tokens fora do armazenamento acessível ao JavaScript.

## Senhas

Senhas são derivadas com `scrypt`, salt aleatório individual de 16 bytes e parâmetros de produção `N=2^17`, `r=8`, `p=1`. O formato persistido contém algoritmo, versão, parâmetros, salt e hash; nunca a senha.

- mínimo: 12 caracteres;
- máximo: 256 bytes UTF-8;
- respostas de login não distinguem usuário inexistente, desabilitado ou senha incorreta;
- login inexistente também executa uma derivação de senha para reduzir diferença temporal.

## Sessão

- duração absoluta: 8 horas;
- atividade é registrada no máximo uma vez a cada 5 minutos;
- logout revoga a sessão no servidor e limpa cookies/cache/storage no navegador;
- usuário desabilitado invalida imediatamente todas as suas sessões na próxima requisição;
- respostas de autenticação usam `Cache-Control: no-store`.

## Rotas

- `POST /api/auth/login` — cria sessão e cookie;
- `GET /api/auth/me` — retorna a identidade atual;
- `POST /api/auth/logout` — revoga e encerra a sessão.

O login aceita `workspace`, `email` e `password`. Há limite de cinco tentativas por minuto por origem no processo atual. Antes de exposição pública, o proxy também deve aplicar rate limiting.

`SameSite=Strict` é a primeira defesa contra CSRF. A aplicação também rejeita toda mutação web sem `Origin` ou com origem ausente de `APP_ORIGINS`; login, logout, CRM, setup e simulações passam pela mesma política. Rotas internas autenticadas por token são excluídas porque não usam a sessão do navegador. Em produção, a lista deve conter somente as origens HTTPS efetivamente publicadas.

## Bootstrap do primeiro administrador

1. Configure as variáveis `ADMIN_*` em um `.env` local não versionado.
2. Compile o backend.
3. Execute `npm run bootstrap:admin -w @noter/backend`.
4. Remova `ADMIN_PASSWORD` do ambiente após a criação.

O comando falha se o administrador já existir e nunca sobrescreve uma senha silenciosamente.
