# Observabilidade local e runbooks

## Escopo e limites

O perfil local adiciona Prometheus, Alertmanager e Grafana à composição de produção para validar coleta, roteamento, visualização e regras de alerta sem conectar um serviço externo. As imagens possuem versão fixada, os dados ficam em volumes Docker locais e as interfaces são publicadas somente em `127.0.0.1`. Telemetria, verificação de atualização, administração de plugins e pré-instalação de plugins do Grafana ficam desabilitadas.

O Prometheus acessa `backend:3000` pela rede privada. O valor de `INTERNAL_INGESTION_TOKEN` é fornecido como secret do Compose e lido de `/run/secrets/metrics_internal_token`; ele não é copiado para os arquivos versionados. O dashboard não contém conteúdo de conversas nem identificadores de negócio.

O Alertmanager agrupa alertas por nome e severidade e separa receivers locais para avisos e críticos. Quando o backlog crítico e o aviso equivalente coexistem no mesmo pipeline, o crítico inibe o aviso. Os receivers não possuem integração de saída: nenhum e-mail, mensagem ou webhook é enviado. Um destino real só deve ser adicionado depois de aprovados seu responsável, política de escalonamento, retenção e armazenamento de credenciais.

## Iniciar

Use apenas secrets locais aleatórios. O comando combina a aplicação containerizada e a extensão de observabilidade; os adapters de WhatsApp, transcrição e IA continuam desabilitados.

```bash
export DB_USER=noter
export DB_PASSWORD='substitua-por-um-segredo-local'
export INTERNAL_INGESTION_TOKEN='substitua-por-32-ou-mais-caracteres-aleatorios'
export MEDIA_SIGNING_SECRET='substitua-por-32-ou-mais-caracteres-aleatorios'
export APP_ORIGINS='http://127.0.0.1:8080'
export GRAFANA_ADMIN_PASSWORD='substitua-por-uma-senha-local-forte'
docker compose -f compose.production.yaml -f compose.observability.yaml up -d --build
```

Acesse:

- aplicação: `http://127.0.0.1:8080`;
- Grafana: `http://127.0.0.1:3001`, com usuário `admin` ou `GRAFANA_ADMIN_USER`;
- Prometheus: `http://127.0.0.1:9090`.
- Alertmanager: `http://127.0.0.1:9093`.

As portas podem ser alteradas com `GRAFANA_PORT`, `PROMETHEUS_PORT` e `ALERTMANAGER_PORT`. A retenção local do Prometheus é de 15 dias e a do Alertmanager é de 120 horas; ajuste-as com `PROMETHEUS_RETENTION` e `ALERTMANAGER_RETENTION`.

## Validar

Antes de analisar o dashboard, confirme:

```bash
docker compose -f compose.production.yaml -f compose.observability.yaml ps
curl --fail --silent http://127.0.0.1:9090/-/ready
curl --fail --silent http://127.0.0.1:9093/-/ready
curl --fail --silent http://127.0.0.1:3001/api/health
curl --fail --silent 'http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22noter-backend%22%7D'
```

O alvo `noter-backend` deve aparecer como `UP`, o Prometheus deve mostrar o Alertmanager como ativo em **Status > Runtime & Build Information**, o dashboard **noter.donadio — Operação** deve existir na pasta **noter.donadio** e `/api/internal/metrics` deve continuar inacessível pelo proxy público. O Grafana provisiona Prometheus e Alertmanager como datasources não editáveis; alertas gerenciados pelo próprio Grafana não são encaminhados automaticamente.

Valide configuração e regras sem iniciar a stack:

```bash
docker run --rm \
  -v "$PWD/observability/prometheus:/etc/prometheus:ro" \
  --entrypoint /bin/promtool \
  prom/prometheus:v3.13.1 \
  check config /etc/prometheus/prometheus.yml

docker run --rm \
  -v "$PWD/observability/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  --entrypoint /bin/amtool \
  prom/alertmanager:v0.33.1 \
  check-config /etc/alertmanager/alertmanager.yml
```

Esses comandos não conseguem ler o secret usado em runtime, mas validam os schemas e os arquivos referenciados.

## Exercício sintético

Com a stack saudável, envie um alerta exclusivamente sintético, confirme seu recebimento e resolva-o automaticamente:

```bash
scripts/test-alertmanager.sh
```

O script usa apenas `NoterSyntheticAlert` e identificadores fixos de teste. Ele não consulta banco, mensagens ou dados de negócio e não aciona destino externo. Para uma porta diferente, defina `ALERTMANAGER_URL`, por exemplo `http://127.0.0.1:19093`.

## Encerrar e preservar dados

```bash
docker compose -f compose.production.yaml -f compose.observability.yaml down
```

O comando preserva os volumes. Remover volumes apaga o histórico local de métricas, silêncios e estado do Alertmanager e a base local do Grafana; faça isso apenas quando essa perda for intencional.

## Runbooks

Antes de qualquer intervenção, registre horário, alerta e resultado. Use somente IDs internos nos logs. Não copie mensagem, transcrição, telefone, QR code, token ou credencial para tickets ou canais de operação.

### Backend indisponível para coleta

1. Confirme se `backend` e `prometheus` estão saudáveis com `docker compose ... ps`.
2. Consulte logs estruturados por código de erro, sem aumentar verbosidade para conteúdo sensível.
3. Teste `/health` a partir da rede da aplicação e `/api/internal/health/ready` com o token por meio seguro.
4. Se o backend está saudável, confira se o secret do Prometheus corresponde ao token do backend e se ambos compartilham a mesma rede.
5. Reinicie somente o processo comprovadamente degradado; não execute migration nem restauração como tentativa exploratória.

### Alertmanager indisponível

1. Confirme `http://127.0.0.1:9093/-/ready` e o estado do container.
2. Verifique no Prometheus se o Alertmanager aparece ativo e consulte logs sem adicionar payloads ou labels sensíveis.
3. Valide novamente `alertmanager.yml` com `amtool`; uma configuração inválida não deve substituir a última válida em runtime.
4. Confirme rede e resolução do endereço `alertmanager:9093` a partir do Prometheus.
5. Depois da recuperação, execute o exercício sintético e verifique recebimento e resolução.

### Outbox atrasado ou com falha

1. Confirme saúde do PostgreSQL, Redis e processo `outbox`.
2. Verifique contagens por estado e a idade do item mais antigo no dashboard.
3. Correlacione a falha pelo ID interno do evento nos logs sanitizados.
4. Determine se houve publicação repetida; consumidores devem manter idempotência.
5. Não apague nem altere eventos diretamente. Retry ou reparo manual exige causa identificada, registro da ação e verificação do efeito no PostgreSQL.

### Download, transcrição ou análise atrasada

1. Confirme se o adapter e o worker esperados estão habilitados no ambiente em questão. Na composição local eles permanecem desabilitados.
2. Verifique Redis, fila correspondente e idade do lease persistido.
3. Correlacione por ID interno da mensagem ou análise sem consultar conteúdo em logs.
4. Antes de retry, confirme se a tentativa anterior expirou e se o worker preservará valores confirmados manualmente.
5. Em falha de provedor, mantenha a mensagem original consultável e suspenda novas chamadas se houver risco de custo ou privacidade.

### Exclusão de mídia pendente

1. Confirme saúde do processo `retention` e acesso ao armazenamento privado.
2. Correlacione a tarefa por seu ID interno; não registre a chave física do objeto.
3. Confirme que o acesso da aplicação ao ativo já foi revogado no PostgreSQL.
4. Repita a tarefa apenas pelo worker idempotente. Não recrie vínculo apagado nem restaure mídia sem solicitação autorizada.
5. Se a remoção física não puder ser comprovada, trate como incidente de privacidade e escale ao responsável definido pela política vigente.

### Jobs em failed

1. Identifique fila e quantidade no dashboard.
2. Consulte o código sanitizado da falha e saúde das dependências.
3. Confirme que o payload contém apenas IDs e que a operação é idempotente.
4. Não remova jobs para silenciar o alerta. Retry em lote exige causa corrigida e limite explícito.
5. Após a intervenção, confirme estado persistido via REST/PostgreSQL e o retorno das métricas ao normal.

## Evolução antes de produção real

- escolher um destino real aprovado e testar entrega, agrupamento, silenciamento e escalonamento sem dados de negócio;
- proteger Prometheus, Alertmanager e Grafana atrás de TLS e autenticação adequados ao ambiente, sem expor suas portas diretamente;
- ajustar limiares após observar carga sintética representativa;
- definir retenção, backup e controle de acesso dos dados operacionais;
- criar exercício periódico de alerta com evidência e responsável;
- revisar atualização das imagens fixadas e changelogs de segurança antes de cada upgrade.
