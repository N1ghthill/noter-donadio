# Homologação assistiva do Groq

## Escopo

Groq é um provedor alternativo explícito para a fase de testes. A ativação não
reprocessa histórico, não envia mensagens pelo WhatsApp e não aplica sugestões
comerciais automaticamente. Mensagem e mídia originais permanecem no
PostgreSQL e no armazenamento privado mesmo quando o provedor falhar.

Modelos padrão:

- análise: `openai/gpt-oss-20b`;
- transcrição: `whisper-large-v3-turbo`.

## Configuração segura

Na VPS, execute em terminal interativo:

```bash
sudo /opt/noter-donadio/scripts/configure-groq-vps.sh
sudo /opt/noter-donadio/scripts/deploy-vps.sh
sudo /opt/noter-donadio/scripts/status-vps.sh --diagnose-assistive
```

O configurador recebe a chave com entrada oculta, valida apenas os metadados dos
dois modelos e grava o segredo no `.env` não versionado com permissão restrita.
Se qualquer validação falhar, a configuração anterior é preservada. Um novo
corte UTC impede envio do backlog ao Groq.

## Rodada controlada

Depois da ativação, envie apenas uma mensagem curta e um áudio curto em
português. Confira mensagem original, estado concluído, modelo persistido,
transcrição, resumo e classificação. Campos ausentes devem permanecer nulos;
nenhuma sugestão deve mover o pipeline sem confirmação humana.

Limites gratuitos e disponibilidade de modelos podem mudar. Erro de limite deve
ficar sanitizado e recuperável por retry administrativo explícito, nunca por
fallback automático para a OpenAI.
