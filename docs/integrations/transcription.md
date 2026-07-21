# Transcrição de áudio

## Estado implementado

O MVP possui um worker BullMQ separado para transcrição, habilitado por `TRANSCRIPTION_ADAPTER=fake`. O adapter atual não lê mídia nem chama serviços externos: ele retorna um texto explicitamente fictício para validar orquestração, retries, persistência e interface.

```text
mensagem de áudio + mídia pending + outbox
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

Inicie o processo local depois da API, outbox e Redis:

```bash
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
- não há download, armazenamento ou reprodução de áudio nesta fatia;
- um adapter real exigirá armazenamento privado, URL curta assinada, limites de tamanho/duração e contrato com o provedor.
