# Operação em VPS única

## Estado e finalidade

A VPS única é o ambiente compartilhado de desenvolvimento assistido e demonstração da fase atual. Ela executa aplicação, PostgreSQL, Redis e workers no mesmo host para reduzir custo e complexidade operacional. Essa topologia é adequada enquanto a carga é baixa, os dados são fictícios e a indisponibilidade de um único host é um risco aceito.

O perfil `compose.vps-demo.yaml` usa HTTP e adapters falsos. Ele não é produção real e não pode receber conversas, contatos, áudios ou credenciais reais. Domínio, TLS, cookies `Secure`, provedores aprovados, armazenamento de mídia externo e backup off-host são portões obrigatórios para mudar essa classificação.

## Topologia

```text
Internet
└── porta 80 → frontend Nginx
    ├── arquivos React
    ├── /api → backend
    └── /socket.io → backend
        ├── PostgreSQL em rede Docker privada
        ├── Redis/BullMQ em rede Docker privada
        └── outbox, realtime, transcription, analysis e retention
```

Somente SSH e o proxy web são publicados pelo host. PostgreSQL, Redis, backend, métricas e painéis operacionais não possuem porta pública.

Os dados duráveis ficam nos volumes `noter_postgres`, `noter_redis` e `noter_media`. PostgreSQL é a fonte de verdade; perder Redis pode exigir reconstrução das filas, mas não pode apagar mensagens ou negociações persistidas.

## Capacidade atual e limites

O dimensionamento inicial de 1 vCPU, 4 GB de RAM e 50 GB de disco suporta a carga de desenvolvimento e demonstração, mas não oferece alta disponibilidade. Builds devem ocorrer de forma serial. Logs Docker possuem rotação de 10 MB por arquivo e cinco arquivos por container.

Antes de aumentar tráfego ou habilitar provedores:

- medir CPU, memória, disco, filas e conexões do PostgreSQL;
- reservar espaço para pelo menos dois snapshots locais e imagens de rollback;
- configurar swap controlado ou ampliar RAM se builds e observabilidade causarem pressão;
- separar banco ou mídia somente quando métricas e risco justificarem a complexidade;
- documentar janela de manutenção e objetivo de recuperação.

## Fonte de verdade e fluxo de deploy

Git é a fonte de verdade do código. Não implemente mudanças diretamente em `/opt/noter-donadio` e não faça deploy de checkout sujo.

Fluxo esperado:

1. implementar e validar em um checkout de desenvolvimento;
2. criar commit coeso e enviar ao repositório remoto;
3. na VPS, executar `git fetch` e `git pull --ff-only`;
4. executar `scripts/deploy-vps.sh`;
5. conferir `scripts/status-vps.sh` e a jornada afetada.

O script de deploy valida o Compose, cria snapshot antes da atualização, constrói uma única imagem compartilhada pelo backend e workers, aplica migrations e espera a interface responder. Use `SKIP_BACKUP=1` somente quando o banco ainda não existe ou houver justificativa operacional registrada.

```bash
cd /opt/noter-donadio
git pull --ff-only
scripts/deploy-vps.sh
scripts/status-vps.sh
```

O `.env` remoto permanece fora do Git, com permissão `600`. Segredos não devem aparecer em comandos versionados, tickets ou logs.

## Backup e restauração

`scripts/backup-vps.sh` cria um snapshot consistente do PostgreSQL e um arquivo do volume de mídia em `/var/backups/noter-donadio`. Redis não é incluído porque não é fonte de verdade. Cada artefato recebe checksum.

Instale o timer versionado:

```bash
install -m 644 deploy/systemd/noter-backup.service /etc/systemd/system/
install -m 644 deploy/systemd/noter-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now noter-backup.timer
```

Valide cada mudança relevante:

```bash
scripts/backup-vps.sh
scripts/verify-postgres-backup.sh /var/backups/noter-donadio/AAAAMMDDTHHMMSSZ/noter-AAAAMMDDTHHMMSSZ.dump
```

Um snapshot no mesmo disco protege contra erro de aplicação, mas não contra perda da VPS. Copiar os snapshots, de forma criptografada, para armazenamento off-host com retenção e teste periódico continua obrigatório antes de dados reais.

## Observabilidade

Prometheus, Alertmanager e Grafana podem compartilhar a VPS durante esta fase porque suas portas ficam em `127.0.0.1`. Acesse os painéis por túnel SSH, nunca expondo diretamente as portas:

```bash
ssh -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 root@VPS
```

Com os segredos definidos no `.env`:

```bash
docker compose \
  -f compose.vps-demo.yaml \
  -f compose.observability.yaml \
  up -d
```

Os receivers atuais não notificam pessoas. Um destino externo exige aprovação separada e deve receber apenas métricas agregadas.

## Promoção para dados reais

O ambiente só pode ser promovido depois de:

- domínio e TLS válidos, com redirecionamento de HTTP e cookies `Secure`;
- troca de `compose.vps-demo.yaml` por configuração de produção revisada;
- firewall e acesso SSH endurecidos, usuário operacional sem login rotineiro como `root`;
- backup off-host automatizado e restauração comprovada;
- destino real de alertas e runbook de incidente;
- resolução ou aceitação formal dos advisories de dependências aplicáveis;
- adapters reais e contratos de privacidade aprovados;
- armazenamento privado de mídia fora do filesystem local;
- avaliação formal de segurança e privacidade.
