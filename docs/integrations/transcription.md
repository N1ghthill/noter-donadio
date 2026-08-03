# Transcrição de áudio

## Estado implementado

O MVP possui um worker BullMQ separado para transcrição. O adapter `fake`
continua exclusivo do profile local `demo`. O adapter `openai`, quando
explicitamente habilitado pelo profile `assistive`, lê o arquivo do volume
privado e usa a API de transcrição por arquivo. A configuração padrão usa
`gpt-4o-mini-transcribe`, idioma `pt` e persiste a localidade `pt-BR`.

O adapter `groq` usa o endpoint compatível de áudio do Groq com
`whisper-large-v3-turbo` por padrão. Ele omite `include=logprobs`, que não é
aceito pelo provedor, e persiste confiança nula quando essa métrica não estiver
disponível. A seleção é explícita por `TRANSCRIPTION_ADAPTER`; não há fallback
silencioso entre provedores.

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
- o downloader Baileys recupera mídia pós-commit sem transportar conteúdo ou
  auth state no job;
- o adapter OpenAI aceita apenas formatos suportados, respeita
  `MEDIA_MAX_BYTES`, limita a duração a cinco minutos por padrão e usa timeout
  e retries limitados;
- quando `TRANSCRIPTION_ADAPTER=openai`,
  `ASSISTIVE_PROCESSING_NOT_BEFORE` é obrigatório e mensagens anteriores ao
  corte nunca chamam o provedor;
- quando `TRANSCRIPTION_ADAPTER=groq`, a mesma regra de corte é obrigatória e a
  chave `GROQ_API_KEY` permanece somente no ambiente do worker;
- não existe diretório `auth_info_baileys` nem objeto integral da mensagem em
  Redis.

A chave é injetada somente no container do worker. Não a inclua em comandos,
logs ou Git.
