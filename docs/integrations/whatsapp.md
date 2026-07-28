# Integração com WhatsApp via Baileys

## Direção aprovada

O conector real do projeto será o Baileys, como cliente adicional do WhatsApp
Web Multi-Device. A API oficial da Meta não faz parte da arquitetura vigente:
webhook, adapters, configuração e chamadas externas correspondentes foram
removidos do runtime.

O Baileys 7 está fixado como dependência de desenvolvimento do conector, mas o
socket ainda não está habilitado. A VPS continua usando o adapter falso e
nenhuma sessão real foi conectada.

## Jornada de demonstração

Ative o simulador explicitamente:

```dotenv
WHATSAPP_ADAPTER=fake
```

1. O usuário autenticado abre `/whatsapp`.
2. `POST /api/whatsapp/setup` gera um QR fictício com validade de cinco minutos.
3. O QR permanece somente na memória da API e nunca é registrado.
4. “Simular leitura do QR” conecta uma conta sintética.
5. `/conversas` permite inserir texto ou áudio fictício pelo pipeline real de
   persistência, outbox, filas e reconciliação.

Esse QR não autentica WhatsApp e serve somente à demonstração.

## Jornada real planejada

O processo dedicado do Baileys será vinculado a uma conta interna e:

1. carregará credenciais e chaves Signal criptografadas do PostgreSQL;
2. emitirá QR efêmero para a API autenticada quando não houver sessão;
3. persistirá cada atualização do auth state de modo atômico;
4. normalizará eventos `messages.upsert`, incluindo `fromMe`;
5. descartará grupos, status, newsletters e protocolo antes da ingestão;
6. persistirá texto recebido ou enviado antes de qualquer processamento;
7. tratará áudio por referência durável e download pós-commit;
8. reconectará com backoff, sem recriar sessão após logout explícito.

A fronteira pura para texto já diferencia `inbound` e `outbound`, preserva o ID
externo e não aceita workspace ou conta vindos do evento. O processo de socket,
o auth state e o download real ainda serão implementados.

## Segurança obrigatória

- usar uma versão 7 fixada; nunca `master`, fork desconhecido ou versão 6;
- manter o logger da biblioteca silencioso e encaminhar apenas eventos
  sanitizados ao logger da aplicação;
- nunca usar `useMultiFileAuthState` em produção;
- criptografar credenciais e chaves com AES-256-GCM e chave externa ao banco;
- nunca gravar QR, JID, telefone, conteúdo ou auth state em logs;
- QR deve ser curto, `no-store` e acessível somente ao administrador do
  workspace;
- não habilitar envio autônomo; `fromMe` serve para capturar o que o usuário
  enviou pelo próprio WhatsApp;
- testes automatizados usam fakes e fixtures sintéticas, nunca conta real.

As tabelas de autenticação criptografada já existem. O primeiro adapter de auth
state persiste credenciais e Signal keys de forma atômica, com isolamento
explícito por workspace e AES-256-GCM vinculado à conta por AAD. Ele suporta
leitura de versões anteriores da chave para rotação, mas ainda não está ligado
a um socket.

Colunas históricas criadas
para o experimento removido com outro provedor permanecem sem uso porque
migrations compartilhadas não são reescritas; removê-las exigirá migration
destrutiva autorizada separadamente.

## Portões antes de conectar

- concluir a auditoria da versão 7 fixada e acompanhar a saída do estado RC;
- ligar o auth state PostgreSQL ao processo dedicado e testar concorrência do
  socket;
- implementar processo dedicado e health state;
- fechar o contrato durável de mídia do Baileys;
- validar termos de uso e aceitar formalmente o risco de bloqueio;
- definir número controlado para homologação;
- obter autorização explícita antes de conectar ou desconectar a sessão real.
