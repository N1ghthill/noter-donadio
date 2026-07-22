# Prontidão para provedores externos

## Estado

Nenhum provedor externo está configurado ou autorizado a receber conversas. A composição de produção mantém `WHATSAPP_ADAPTER`, `TRANSCRIPTION_ADAPTER` e `AI_ADAPTER` como `disabled`; o desenvolvimento usa apenas adapters falsos.

## WhatsApp

O alvo para produção é a [WhatsApp Cloud API oficial da Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api). A implementação depende de uma conta empresarial controlada, WABA, número dedicado, credenciais e autorização explícita.

Primeira fase permitida pelo desenho:

- somente eventos recebidos; nenhum endpoint de envio;
- HTTPS e validação da autenticidade do webhook antes do parse;
- deduplicação por workspace, conta e ID externo;
- persistência atômica antes de download de mídia e filas;
- payload original minimizado e com retenção definida;
- logs sem mensagem, telefone, mídia, QR ou token;
- testes de contrato com fixtures sintéticas obtidas da documentação oficial.

A assinatura e os exemplos devem seguir a [coleção oficial de webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks) e os [exemplos mantidos pela Meta](https://github.com/fbsamples/whatsapp-api-examples). SDKs e payloads não atravessam a porta do domínio.

## Transcrição

O adapter futuro pode usar a API de transcrições da OpenAI, mas só será implementado após disponibilização segura da credencial e aprovação do tratamento de áudio. O contrato atual permite trocar o adapter sem mudar mensagem, lease ou job.

Requisitos mínimos:

- obter a mídia somente depois da persistência da mensagem;
- validar tipo, tamanho e duração antes do upload;
- enviar idioma quando conhecido e somente os bytes necessários;
- manter timeout, retry limitado, custo e códigos de erro sanitizados;
- registrar modelo e duração, sem copiar áudio para logs;
- testar com áudio sintético e avaliar qualidade em amostra autorizada antes da produção.

O candidato técnico atual é `gpt-4o-transcribe`; a escolha final continua configurável e depende de avaliação de qualidade, latência, custo, retenção e região.

## Análise estruturada

O adapter futuro deve usar saída estruturada por JSON Schema estrito e continuar tratando a resposta como não confiável. A validação Zod existente permanece a última fronteira antes do PostgreSQL.

O modelo não será fixado sem avaliação representativa. Para extração de alto volume, avaliar primeiro uma variante otimizada para custo e latência; usar um modelo mais capaz apenas quando os testes demonstrarem necessidade. Toda execução deve registrar modelo, versão do prompt, tokens, duração e confiança quando disponível.

## Portões de ativação

Cada integração real exige, antes de mudar seu adapter de `disabled`:

1. decisão arquitetural com provedor, finalidade, região, retenção, custo e condição de saída;
2. contrato e avaliação de privacidade aprovados;
3. segredo injetado por mecanismo externo, nunca em arquivo versionado;
4. adapter, validação de fronteira, testes de contrato e kill switch;
5. métricas de erro, latência, fila e custo com alertas;
6. teste em workspace e conta controlados;
7. autorização explícita para ativação.

Credenciais ausentes ou inválidas devem impedir a inicialização do processo correspondente. Nenhum fallback pode enviar dados para outro provedor silenciosamente.
