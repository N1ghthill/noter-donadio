# Prontidão para provedores externos

## Estado

O número permanente foi pareado pelo cliente e a sessão Baileys está conectada.
O aplicativo continua sem endpoint de envio. O runtime e
toda configuração da API oficial da Meta foram removidos por decisão do
produto. Transcrição e análise falsas ficaram restritas ao profile `demo`.
Os adapters OpenAI, o bloqueio temporal de backlog e os workers reais estão
ativos. A primeira rodada real preservou integralmente mensagens e mídias, mas
as análises falharam; a homologação OpenAI continua pendente até uma nova
tentativa administrativa controlada identificar e corrigir a categoria segura
da falha.

## WhatsApp via Baileys

O alvo aprovado é o [Baileys mantido pelo WhiskeySockets](https://github.com/WhiskeySockets/Baileys).
Ele opera como cliente adicional do WhatsApp Web Multi-Device e não é uma API
oficial ou endossada pelo WhatsApp.

Estado implementado:

- jornada falsa de QR e conexão para demonstração;
- tabelas para credenciais e chaves criptografadas;
- Baileys `7.0.0-rc13` fixado e auth state PostgreSQL com AES-256-GCM,
  isolamento explícito por workspace e suporte a rotação;
- ingestão idempotente e isolada por workspace;
- fronteira pura para texto Baileys recebido e enviado;
- processo dedicado, reconexão, QR efêmero autenticado e logger silencioso;
- adaptação somente de `messages.upsert` novos, sem sincronização de histórico;
- pipeline genérico de mídia, filas e retenção;
- referência mínima de áudio, imagem e documento cifrada, download pós-commit
  e acesso privado;
- recuperação de URL expirada por solicitação idempotente de reupload ao
  telefone, com comando Redis restrito a IDs;
- filtros de grupos, status, newsletters e protocolo no domínio.

Antes de promover para uso amplo:

1. concluir a auditoria da release 7 fixada e acompanhar sua estabilização;
2. manter a homologação de texto, áudio, imagem e documento com o número
   permanente conforme
   [`whatsapp-homologation.md`](whatsapp-homologation.md);
3. documentar aceite do risco de bloqueio e dos termos de uso;
4. medir em piloto a taxa de sucesso da recuperação de mídia expirada.

`useMultiFileAuthState` não será usado na VPS. A própria documentação do
Baileys recomenda auth state próprio para produção; o diretório de autenticação
equivale a uma credencial duradoura e não pode entrar em imagem, Git, log,
backup desprotegido ou ferramenta de IA.

## Transcrição

O adapter aprovado usa `gpt-4o-mini-transcribe` por padrão, com arquivo vindo
do volume privado somente após download concluído.

Requisitos mínimos:

- obter mídia somente após persistência da mensagem;
- validar tipo, tamanho e duração antes do upload;
- enviar somente os bytes necessários;
- aplicar timeout, retry limitado, custo e códigos sanitizados;
- registrar modelo e duração sem copiar áudio para logs;
- avaliar qualidade com áudio sintético e amostra autorizada.

## Análise estruturada

O adapter aprovado usa a Responses API com Structured Outputs, `store: false`
e `gpt-5.6-sol` por padrão. A validação Zod do adapter e a validação de domínio
independente tratam toda resposta como não confiável.

Toda execução deve registrar modelo, versão do prompt, tokens, duração e
confiança quando disponíveis. Nenhuma sugestão é aplicada sem ação humana.

## Portões de ativação

Cada integração real exige:

1. decisão arquitetural com finalidade, retenção, custo e condição de saída;
2. revisão de privacidade e termos;
3. segredo injetado externamente, nunca versionado;
4. adapter, validação de fronteira, testes e kill switch;
5. métricas e alertas sem dados de negócio;
6. teste em workspace e conta controlados;
7. autorização explícita para conectar a sessão ou transmitir dados.

Em 30/07/2026, o proprietário configurou a OpenAI para mensagens posteriores
ao corte operacional. O adapter exige
`ASSISTIVE_PROCESSING_NOT_BEFORE`; jobs anteriores ao corte não chamam o
provedor. Áudios anteriores ainda pendentes recebem o código sanitizado
`OUTSIDE_AUTHORIZED_PROCESSING_WINDOW`.

Credenciais ausentes ou inválidas devem impedir a inicialização. Nenhum
fallback pode transmitir dados para outro provedor silenciosamente.
O configurador valida autenticação e acesso aos modelos de transcrição e
análise antes de alterar o `.env` ou habilitar os workers.

Falhas são persistidas apenas em categorias sanitizadas. A tela Administração
lista análise e transcrição falhas sem conteúdo e permite nova tentativa apenas
para mensagens posteriores ao corte. O usuário precisa confirmar que o
conteúdo será reenviado à OpenAI; a ação muda o estado e cria a outbox na mesma
transação, além de registrar `processing_retry_requested` na auditoria.
