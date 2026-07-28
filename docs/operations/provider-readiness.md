# Prontidão para provedores externos

## Estado

Nenhum provedor externo está configurado ou autorizado a receber conversas. A
VPS usa apenas adapters falsos. O runtime e toda configuração da API oficial da
Meta foram removidos por decisão do produto.

## WhatsApp via Baileys

O alvo aprovado é o [Baileys mantido pelo WhiskeySockets](https://github.com/WhiskeySockets/Baileys).
Ele opera como cliente adicional do WhatsApp Web Multi-Device e não é uma API
oficial ou endossada pelo WhatsApp.

Estado implementado:

- jornada falsa de QR e conexão para demonstração;
- tabelas para credenciais e chaves criptografadas;
- ingestão idempotente e isolada por workspace;
- fronteira pura para texto Baileys recebido e enviado;
- pipeline genérico de mídia, filas e retenção;
- filtros de grupos, status, newsletters e protocolo no domínio.

Antes de instalar e habilitar:

1. fixar uma release 7 suportada e auditar dependências;
2. implementar `AuthenticationState` no PostgreSQL com AES-256-GCM;
3. persistir cada atualização de credencial e chave de forma atômica;
4. criar processo dedicado para socket, reconexão e health state;
5. manter o logger da biblioteca silencioso e redigir logs da aplicação;
6. implementar QR efêmero autenticado e `Cache-Control: no-store`;
7. adaptar `messages.upsert` sem sincronizar histórico completo;
8. implementar referência e download duráveis para áudio;
9. testar apenas com número controlado e dados sintéticos;
10. documentar aceite do risco de bloqueio e dos termos de uso.

`useMultiFileAuthState` não será usado na VPS. A própria documentação do
Baileys recomenda auth state próprio para produção; o diretório de autenticação
equivale a uma credencial duradoura e não pode entrar em imagem, Git, log,
backup desprotegido ou ferramenta de IA.

## Transcrição

O adapter futuro pode usar um provedor aprovado somente depois de revisão do
tratamento de áudio. O contrato atual permite troca sem mudar mensagem, lease
ou job.

Requisitos mínimos:

- obter mídia somente após persistência da mensagem;
- validar tipo, tamanho e duração antes do upload;
- enviar somente os bytes necessários;
- aplicar timeout, retry limitado, custo e códigos sanitizados;
- registrar modelo e duração sem copiar áudio para logs;
- avaliar qualidade com áudio sintético e amostra autorizada.

## Análise estruturada

O adapter futuro deve usar saída estruturada com schema estrito e tratar toda
resposta como não confiável. A validação Zod existente permanece a última
fronteira antes do PostgreSQL.

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

Credenciais ausentes ou inválidas devem impedir a inicialização. Nenhum
fallback pode transmitir dados para outro provedor silenciosamente.
