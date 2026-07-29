# Operação em VPS única

## Estado e finalidade

A VPS única é o ambiente compartilhado de desenvolvimento assistido,
homologação controlada e demonstração da fase atual. Ela executa aplicação,
proxy TLS, PostgreSQL, Redis e workers no mesmo host para reduzir custo e
complexidade operacional. Essa topologia é adequada enquanto a carga é baixa e
a indisponibilidade ou perda integral de um único host é um risco explicitamente
aceito.

O perfil `compose.vps-demo.yaml` publica `leadcontrol.online` em HTTPS, usa
cookies `Secure` e executa o conector Baileys e o download privado de áudio.
Adapters falsos de IA e transcrição ficam restritos ao profile `demo` e nunca
são iniciados junto do profile `baileys`. O ambiente pode receber os dados
controlados usados na homologação atual, mas ainda não deve ser tratado como
produção com garantia de disponibilidade ou recuperação de desastre.

## Topologia

```text
Internet
└── portas 80/443 → Caddy (TLS automático e redirecionamento HTTPS)
    ├── arquivos React → frontend Nginx privado
    ├── /api/internal → 404
    └── /api e /socket.io → backend privado
        ├── PostgreSQL em rede Docker privada
        ├── Redis/BullMQ em rede Docker privada
        └── outbox, realtime, Baileys, media-download e retention
```

Somente SSH e o proxy web são publicados pelo host. PostgreSQL, Redis, backend, métricas e painéis operacionais não possuem porta pública.

Os dados duráveis ficam nos volumes `noter_postgres`, `noter_redis` e `noter_media`. PostgreSQL é a fonte de verdade; perder Redis pode exigir reconstrução das filas, mas não pode apagar mensagens ou negociações persistidas.

## Capacidade atual e limites

O dimensionamento inicial de 1 vCPU, 4 GB de RAM e 50 GB de disco suporta a carga de desenvolvimento e demonstração, mas não oferece alta disponibilidade. Builds devem ocorrer de forma serial. Logs Docker possuem rotação de 10 MB por arquivo e cinco arquivos por container.

A VPS atual mantém 2 GB de swap para absorver picos transitórios. Swap não substitui memória: uso persistente ou latência de fila exige reduzir processos concorrentes ou ampliar a VPS.

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
3. entrar na VPS como `noterops`;
4. atualizar o checkout pelos comandos Git autorizados;
5. executar o deploy autorizado;
6. conferir o status e a jornada afetada.

O script de deploy valida o Compose, cria snapshot antes da atualização, constrói uma única imagem compartilhada pelo backend e workers, aplica migrations e espera a interface responder. Use `SKIP_BACKUP=1` somente quando o banco ainda não existe ou houver justificativa operacional registrada.

```bash
ssh noterops@VPS
sudo /usr/bin/git -C /opt/noter-donadio fetch origin main
sudo /usr/bin/git -C /opt/noter-donadio pull --ff-only origin main
sudo /opt/noter-donadio/scripts/deploy-vps.sh
sudo /opt/noter-donadio/scripts/status-vps.sh
```

Para diagnosticar sem imprimir conteúdo, telefone, referência ou chave de
mídia:

```bash
sudo /opt/noter-donadio/scripts/status-vps.sh --diagnose-baileys
sudo /opt/noter-donadio/scripts/status-vps.sh --diagnose-media
```

O diagnóstico de mídia retorna somente contagens agregadas de áudio por estado
de download e logs sanitizados do worker.

Na primeira ativação autorizada do conector Baileys, use:

```bash
sudo /opt/noter-donadio/scripts/deploy-vps.sh --enable-baileys
```

O script exige exatamente uma conta interna `primary`, resolve os UUIDs no
PostgreSQL e grava no `.env` da VPS uma chave AES-256 aleatória sem imprimi-la.
Execuções posteriores preservam a chave existente, mantêm o profile `baileys`
e habilitam `MEDIA_DOWNLOAD_ADAPTER=baileys`. O comando não lê o QR nem envia
mensagens. Transcrição e análise reais continuam desligadas.

Quando o sistema operacional indicar que um novo kernel exige reinicialização,
execute o deploy com reinicialização condicionada ao health check:

```bash
sudo /opt/noter-donadio/scripts/deploy-vps.sh --reboot-if-required
```

A opção não reinicia a VPS quando `/var/run/reboot-required` estiver ausente.

O `.env` remoto permanece fora do Git, com permissão `600`. Segredos não devem aparecer em comandos versionados, tickets ou logs. Para este perfil, mantenha:

```dotenv
APP_DOMAIN=leadcontrol.online
APP_ORIGINS=https://leadcontrol.online
PUBLIC_ORIGIN=https://leadcontrol.online
```

O registro `A` do domínio deve apontar para a VPS e as portas TCP 80/443 devem estar liberadas. A porta UDP 443 é publicada para HTTP/3; a aplicação continua funcional por HTTPS/TCP se UDP estiver indisponível. O Caddy obtém e renova o certificado automaticamente e preserva seu estado nos volumes `noter_caddy_data` e `noter_caddy_config`.

Defina `ENABLE_OBSERVABILITY=1` no `.env` quando o deploy também deva preservar e reconciliar Prometheus, Alertmanager e Grafana.

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

Um snapshot no mesmo disco protege contra erro de aplicação, mas não contra
perda da VPS. Nesta fase, o proprietário aceitou operar sem cópia off-host para
reduzir complexidade. O impacto aceito é a perda integral de dados e backups em
caso de falha ou perda da VPS. Essa exceção deve ser removida antes de assumir
compromisso de disponibilidade ou recuperação, copiando snapshots de forma
criptografada para armazenamento externo com retenção e restauração testada.

## Observabilidade

Prometheus, Alertmanager e Grafana podem compartilhar a VPS durante esta fase porque suas portas ficam em `127.0.0.1`. Acesse os painéis por túnel SSH, nunca expondo diretamente as portas:

```bash
ssh -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 noterops@VPS
```

Com os segredos definidos no `.env`:

```bash
docker compose \
  -f compose.vps-demo.yaml \
  -f compose.observability.yaml \
  up -d
```

Os receivers atuais não notificam pessoas. Um destino externo exige aprovação separada e deve receber apenas métricas agregadas.

Na VPS atual, autenticação SSH por senha, interação de teclado e login remoto de `root` estão desabilitados. O usuário `noterops` aceita somente a chave operacional e não pertence aos grupos `sudo` ou `docker`. O arquivo versionado `deploy/sudoers/noterops` permite apenas atualizar este checkout e executar deploy, status e backup.

O `nftables` aplica `deploy/nftables/noter-host.nft` na inicialização. A política de entrada permite conexões estabelecidas, loopback, ICMP, SSH e web nas portas TCP 22/80/443 e HTTP/3 em UDP 443. Não use `flush ruleset`, pois isso também removeria regras administradas pelo Docker.

## Promoção para produção

O ambiente só pode ser promovido depois de:

- configuração de produção revisada em substituição ao perfil de demonstração;
- backup off-host automatizado e restauração comprovada;
- destino real de alertas e runbook de incidente;
- resolução ou aceitação formal dos advisories de dependências aplicáveis;
- adapters reais de IA/transcrição e contratos de privacidade aprovados;
- armazenamento privado de mídia fora do filesystem local;
- avaliação formal de segurança e privacidade.
