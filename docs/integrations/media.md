# Armazenamento, acesso e retenção de mídia

## Estado implementado

No adapter local, uma simulação de áudio cria um WAV silencioso e explicitamente fictício. O arquivo é gravado antes da ingestão em `MEDIA_STORAGE_PATH`; depois, a mensagem, o registro de mídia e a outbox são persistidos na mesma transação. A chave é determinística por workspace e UUID do cliente, portanto uma repetição idempotente não cria outro arquivo.

Para mídia externa, a mensagem, a referência em estado `pending` e
`message.media.download_requested` são persistidos juntos. O worker recebe
somente IDs internos, adquire um lease, baixa para uma chave `.media` exclusiva
da tentativa e confirma condicionalmente o registro antes de liberar a
transcrição. No Baileys, `url`, `directPath` e `mediaKey` são criptografados com
AES-256-GCM e AAD vinculada a workspace, conta e mensagem antes do commit. O
downloader reabre essa referência somente no worker, identifica áudio, imagem
ou documento pela mensagem, impõe timeout de 30
segundos e `MEDIA_MAX_BYTES` e não transporta credencial ou bytes pelo Redis.
Quando o host de mídia responde `403`, `404` ou `410`, o worker solicita ao
processo Baileys conectado uma única renovação. O comando Redis contém somente
workspace, conta, mensagem e UUID da solicitação. O processo usa o JID técnico
original preservado dentro da referência cifrada, solicita o reupload ao
telefone e substitui somente `url` e `directPath` cifrados antes de uma nova
tentativa. Falha, ausência da sessão ou timeout mantêm o retry normal da fila.
Erros de tamanho, tipo, decriptação ou política não acionam reupload.

O arquivo não é servido como conteúdo estático. A timeline e a biblioteca
autenticadas informam apenas se o acesso está disponível. Reprodução de áudio,
prévia de imagem e download de documento só solicitam
`GET /api/media/:messageId/access` após ação do usuário. A rota retorna uma URL
relativa assinada válida por dois minutos. A leitura em
`GET /api/media/:messageId/content` exige simultaneamente sessão ativa, o mesmo
workspace, prazo válido e assinatura HMAC correta. Documentos são entregues
como attachment; imagens e áudios podem ser inline.

Formatos aceitos são áudio, JPEG, PNG, WebP, GIF, PDF, texto, CSV, ZIP e os
formatos usuais de Office. HTML, SVG e MIME desconhecido são recusados antes da
gravação para não servir conteúdo ativo na origem da aplicação.

## Configuração local

```dotenv
MEDIA_STORAGE_PATH=storage/media
MEDIA_SIGNING_SECRET=substitua-por-um-segredo-aleatorio-com-32-ou-mais-caracteres
MEDIA_RETENTION_DAYS=30
MEDIA_ORPHAN_GRACE_HOURS=24
MEDIA_MAX_BYTES=10485760
```

O diretório fica fora dos arquivos versionados. O adapter cria diretórios com modo `0700` e arquivos com `0600`; aceita apenas a chave `<workspace UUID>/<clientMessageId UUID>.wav`, impede travessia de diretório e rejeita bytes acima do limite configurado.

Inicie a remoção periódica em um processo próprio:

```bash
npm run start:retention -w @noter/backend
```

O processo executa ao iniciar e a cada hora. Primeiro conclui tarefas físicas
deixadas por exclusões de contato. Depois, em lotes de 100, apaga cada arquivo
expirado e minimiza o registro, removendo `storageKey` e tamanho e registrando
`removedAt`. Por fim, reconcilia um lote de arquivos `.media` sem referência no
PostgreSQL e só os remove depois da janela configurada, que é de 24 horas por
padrão. Arquivos `.wav`, arquivos recentes, links e caminhos fora do formato
fechado não entram nessa varredura.

A exclusão do arquivo é idempotente, de modo que uma falha pode ser tentada
novamente com segurança. A transcrição e os metadados não sensíveis permanecem
associados à mensagem quando a remoção ocorreu apenas por retenção.

## Limites desta fatia

- não há endpoint público, URL permanente nem chave física na resposta da API;
- o endpoint entrega o arquivo completo; suporte otimizado a `Range` e
  thumbnails geradas no servidor ficam para uma evolução;
- a recuperação depende de o telefone ainda possuir a mídia e de a sessão
  Baileys permanecer conectada; ela não recria arquivos já removidos por
  retenção;
- exclusão manual por contato possui tarefas duráveis e tentativas `.media`
  órfãs são reconciliadas; exclusão integral do workspace ainda será
  implementada antes de produção;
- `MEDIA_SIGNING_SECRET` deve vir de um gerenciador de segredos em produção;
- o volume privado na VPS é adequado à fase controlada aceita pelo proprietário,
  mas não oferece alta disponibilidade nem recuperação contra perda integral do
  host; armazenamento de objetos privado permanece a evolução para produção.
