# Armazenamento, reprodução e retenção de áudio

## Estado implementado

No adapter local, uma simulação de áudio cria um WAV silencioso e explicitamente fictício. O arquivo é gravado antes da ingestão em `MEDIA_STORAGE_PATH`; depois, a mensagem, o registro de mídia e a outbox são persistidos na mesma transação. A chave é determinística por workspace e UUID do cliente, portanto uma repetição idempotente não cria outro arquivo.

O arquivo não é servido como conteúdo estático. A timeline autenticada informa apenas se a reprodução está disponível. Ao clicar em **Carregar áudio**, o frontend solicita `GET /api/media/:messageId/access`, que retorna uma URL relativa assinada válida por dois minutos. A leitura em `GET /api/media/:messageId/content` exige simultaneamente a sessão ativa, o mesmo workspace, prazo válido e assinatura HMAC correta.

## Configuração local

```dotenv
MEDIA_STORAGE_PATH=storage/media
MEDIA_SIGNING_SECRET=substitua-por-um-segredo-aleatorio-com-32-ou-mais-caracteres
MEDIA_RETENTION_DAYS=30
MEDIA_MAX_BYTES=10485760
```

O diretório fica fora dos arquivos versionados. O adapter cria diretórios com modo `0700` e arquivos com `0600`; aceita apenas a chave `<workspace UUID>/<clientMessageId UUID>.wav`, impede travessia de diretório e rejeita bytes acima do limite configurado.

Inicie a remoção periódica em um processo próprio:

```bash
npm run start:retention -w @noter/backend
```

O processo executa ao iniciar e a cada hora. Primeiro conclui tarefas físicas deixadas por exclusões de contato. Depois, em lotes de 100, apaga cada arquivo expirado e minimiza o registro, removendo `storageKey` e tamanho e registrando `removedAt`. A exclusão do arquivo é idempotente, de modo que uma falha pode ser tentada novamente com segurança. A transcrição e os metadados não sensíveis permanecem associados à mensagem quando a remoção ocorreu apenas por retenção.

## Limites desta fatia

- nenhum áudio é baixado do WhatsApp ou enviado a provedor externo;
- somente o WAV fictício local é provisionado; formatos reais dependerão do adapter de mídia;
- não há endpoint público, URL permanente nem chave física na resposta da API;
- o endpoint entrega o arquivo completo; suporte otimizado a `Range` fica para o adapter de objeto/produção;
- exclusão manual por contato possui tarefas duráveis; exclusão integral do workspace e uma varredura geral de órfãos ainda serão implementadas antes de produção;
- `MEDIA_SIGNING_SECRET` deve vir de um gerenciador de segredos em produção, e o armazenamento local deverá ser substituído por objeto privado criptografado.
