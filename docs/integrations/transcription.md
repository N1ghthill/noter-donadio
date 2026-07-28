# Transcrição de áudio

## Estado implementado

O MVP possui um worker BullMQ separado para transcrição, habilitado por `TRANSCRIPTION_ADAPTER=fake`. O adapter atual não lê os bytes armazenados nem chama serviços externos: ele retorna um texto explicitamente fictício para validar orquestração, retries, persistência e interface.

```text
mensagem de áudio + referência de mídia pending + outbox
  → fila media-download
  → lease e download para armazenamento privado
  → download completed + outbox
  → dispatcher
  → fila audio-transcription
  → validação estrita do job com IDs
  → lease PostgreSQL processing
  → adapter de transcrição
  → mídia completed/failed + outbox
  → job de análise da transcrição concluída
  → evento realtime sanitizado
  → reconciliação REST
```

Inicie os processos locais depois da API, outbox e Redis:

```bash
npm run start:media-download -w @noter/backend
npm run start:transcription -w @noter/backend
```

## Idempotência e retry

Cada tentativa recebe `transcriptionAttemptId` e `processingStartedAt`. Apenas o detentor do lease pode concluir ou falhar a mídia. Uma entrega repetida encontra `completed` e não chama novamente o adapter; um lease em processamento só pode ser retomado após cinco minutos. Jobs ocupados são tentados novamente a cada 30 segundos, por tempo suficiente para recuperar um lease abandonado.

Falhas persistem somente o código sanitizado `TRANSCRIPTION_PROCESSING_FAILED` e liberam o lease para o retry do BullMQ. A mensagem original e o registro da mídia permanecem consultáveis em todos os estados.

## Segurança e limites

- jobs aceitam estritamente `workspaceId`, `messageId` e `negotiationId`;
- conteúdo, bytes de áudio e transcrição não trafegam no BullMQ ou Socket.IO;
- o resultado do adapter é validado antes da persistência;
- a transcrição permanece como artefato da mensagem de áudio, sem duplicar a timeline;
- somente uma transcrição concluída produz `message.audio.ready_for_analysis`, contendo IDs;
- o formulário local de áudio ignora qualquer texto enviado pelo navegador;
- o áudio de demonstração é um WAV local fictício; o armazenamento privado, a URL curta assinada, o player e a retenção estão descritos em [`media.md`](media.md);
- o adapter Meta de download permanece desligado até revisão operacional e configuração autorizada.

## Adapter de download da Meta

O adapter `meta` segue as operações oficiais para
[resolver a URL](https://www.postman.com/meta/whatsapp-business-platform/request/fpj02x0/retrieve-media-url)
e [baixar a mídia](https://www.postman.com/meta/whatsapp-business-platform/request/zsq66eh/download-media).
Ele usa `GET /{media-id}?phone_number_id=...`, envia o token somente no header
`Authorization`, resolve uma URL nova em cada tentativa e valida timeout,
tamanho, MIME e cada redirecionamento. URLs temporárias são aceitas somente por
HTTPS nos hosts de mídia esperados da Meta.

Para um perfil real, o token e a versão explícita da Graph API são injetados
somente no worker:

```dotenv
MEDIA_DOWNLOAD_ADAPTER=meta
META_ACCESS_TOKEN=valor-fora-do-git
META_GRAPH_API_VERSION=vXX.X
```

No `compose.production.yaml`, o processo pertence ao profile
`media-download`; ativá-lo exige `COMPOSE_PROFILES=media-download`. Não use
`latest` como versão e não coloque o token no banco, em jobs ou em URLs. O
perfil da VPS continua usando o adapter falso.
