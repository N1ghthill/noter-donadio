# Empacotamento e preparação de produção

## Estado atual

O repositório possui imagens reproduzíveis para backend e frontend e uma composição que separa API, outbox, eventos em tempo real, retenção, PostgreSQL e Redis. Isso permite validar o formato operacional sem publicar, fazer deploy ou conectar provedores reais.

O sistema ainda não está liberado para conversas reais. O webhook oficial da
Meta e o adapter autenticado de download de mídia estão implementados atrás de
kill switches; no perfil de produção permanecem `disabled` e o worker de mídia
real é opt-in. Transcrição e IA ainda possuem somente adapters falsos.
Armazenamento local de mídia também deve ser substituído por objeto privado
criptografado antes de produção real.

O perfil público por IP definido em `compose.vps-demo.yaml` é um ambiente transitório de desenvolvimento e demonstração, não uma variação de produção. Sua operação e seus portões estão documentados em [`vps.md`](vps.md).

## Validação das imagens

Use credenciais exclusivamente locais e aleatórias. Não reutilize secrets de ambiente compartilhado.

```bash
export DB_USER=noter
export DB_PASSWORD='substitua-por-um-segredo-local'
export INTERNAL_INGESTION_TOKEN='substitua-por-32-ou-mais-caracteres-aleatorios'
export MEDIA_SIGNING_SECRET='substitua-por-32-ou-mais-caracteres-aleatorios'
export APP_ORIGINS='http://127.0.0.1:8080'
docker compose -f compose.production.yaml config
docker compose -f compose.production.yaml build
```

A composição publica por padrão somente `127.0.0.1:8080`. TLS deve terminar em um proxy externo aprovado; nesse caso, `APP_ORIGINS` deve conter somente a origem HTTPS pública e o bind deve continuar restrito à rede do proxy.

## Inicialização controlada

`migrate` executa `prisma migrate deploy` e precisa terminar com sucesso antes dos processos do backend. Depois, o primeiro administrador deve ser criado por uma execução isolada com `ADMIN_PASSWORD` efêmera; remova a variável imediatamente. Não execute `seed:demo` em ambiente com dados reais.

Antes de qualquer upgrade:

1. gere e teste backup consistente do PostgreSQL e do armazenamento privado;
2. valide a migration em cópia restaurada;
3. confirme capacidade e persistência do Redis, que não é fonte de verdade;
4. execute readiness privado com `x-internal-token` sem expor sua resposta publicamente;
5. mantenha rollback da imagem anterior e restauração do banco documentados.

## Métricas e alertas

O backend oferece `GET /api/internal/metrics` no formato Prometheus, com prazo de coleta de dois segundos. O scraper deve acessar `backend:3000` pela rede privada e enviar `x-internal-token` como header protegido. O Nginx público responde `404` para todo `/api/internal/`; não abra uma porta pública alternativa para contornar essa restrição.

O Nginx sobrescreve `X-Forwarded-For`, e o backend confia nesse salto somente em produção. Assim, os limites de login e exportação usam o endereço observado pelo proxy sem aceitar um valor arbitrário enviado pelo cliente. Antes de colocar outro proxy ou balanceador à frente do Nginx, restrinja a rede entre eles e configure explicitamente a propagação do endereço original; até essa topologia ser definida, não adicione confiança genérica em cadeias de proxies.

As séries disponíveis são:

- `noter_outbox_events{status}`;
- `noter_media_downloads{state}`, `noter_transcriptions{state}` e `noter_analyses{state}`;
- `noter_media_deletion_tasks`;
- `noter_oldest_pending_age_seconds{pipeline}`;
- `noter_queue_jobs{queue,state}`.

Ponto inicial para alertas, a ajustar depois de medir carga real:

- scrape ou readiness indisponível por dois minutos: crítico;
- outbox pendente mais antiga acima de 120 segundos: aviso; acima de 300: crítico;
- download, transcrição ou análise pendente acima de 10 minutos: aviso; acima de 30: crítico;
- qualquer outbox com estado `failed`: crítico até investigação;
- tarefa de exclusão de mídia pendente por mais de 15 minutos: aviso;
- jobs `failed` em qualquer fila: aviso e inspeção antes de retry ou remoção.

O runbook deve correlacionar por IDs internos nos logs estruturados. Nunca acrescente conteúdo, telefone, workspace ou mensagem como label para facilitar diagnóstico.

Uma composição local, regras Prometheus, Alertmanager, dashboard Grafana e procedimentos de resposta versionados estão disponíveis em [`observability.md`](observability.md). Esse perfil valida coleta, avaliação, agrupamento e inibição, mas seus receivers são locais e não enviam notificações. Qualquer destino externo depende de configuração e aprovação separadas.

## Backup e teste de restauração

Com o PostgreSQL da composição em execução, gere um dump customizado com permissões restritas:

```bash
export DB_USER=noter
export BACKUP_DIRECTORY=/caminho/privado/fora-do-repositorio
scripts/backup-postgres.sh
```

O script grava o dump de forma atômica e produz um checksum SHA-256. Ele não inclui o armazenamento de mídia: o provedor privado futuro deve possuir backup, retenção e restauração próprios.

Teste o dump em um PostgreSQL 16 efêmero e isolado, sem tocar no banco de origem:

```bash
scripts/verify-postgres-backup.sh /caminho/privado/noter-AAAAMMDDTHHMMSSZ.dump
```

A verificação confere o checksum quando disponível, restaura com `--exit-on-error` e confirma a tabela de migrations. O container temporário é removido ao terminar. Armazene dumps criptografados fora do host da aplicação, aplique retenção e registre data, resultado e responsável por cada teste periódico.

## Checklist pendente antes de dados reais

- escolher e aprovar um provedor oficial de WhatsApp ou aceitar formalmente o risco da integração adotada;
- decidir como capturar por fonte oficial as mensagens enviadas pelo próprio usuário;
- implementar criptografia autenticada das credenciais do WhatsApp com chave fora do banco;
- implementar adapters aprovados de transcrição e IA, com contratos, retenção e custos revisados;
- substituir filesystem por armazenamento de objeto privado criptografado;
- aprovar o protocolo de exclusão integral de workspace, prazo de auditoria e procedimento de atendimento ao titular; a exportação síncrona atual deve se tornar assíncrona para grandes volumes;
- configurar TLS e rate limiting no proxy, conectar um destino aprovado aos alertas já versionados e testar backup e restauração periodicamente;
- executar avaliação de segurança e privacidade antes do primeiro workspace real.

O inventário de portões por integração está em [`provider-readiness.md`](provider-readiness.md), e a evidência do marco atual em [`acceptance.md`](acceptance.md).

Publicação de imagens, release e deploy continuam exigindo autorização explícita.
